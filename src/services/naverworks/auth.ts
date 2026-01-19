import axios from 'axios';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { getEncryptedValue, setEncryptedValue } from '../database/envDB';

const TOKEN_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Access Token 발급
 * - 먼저 저장된 ACCESS_TOKEN 반환 시도
 * - 없거나 만료시 refresh_token으로 갱신
 */
export async function getAccessToken(): Promise<string> {
  // 먼저 저장된 토큰 시도
  try {
    const storedToken = await getEncryptedValue('ACCESS_TOKEN');
    if (storedToken) {
      return storedToken;
    }
  } catch {
    // 저장된 토큰 없음, 갱신 진행
  }

  return await refreshAccessToken();
}

/**
 * Access Token 갱신 (refresh_token 사용)
 */
export async function refreshAccessToken(): Promise<string> {
  const refreshToken = await getEncryptedValue('REFRESH_TOKEN');
  const clientId = config.naverWorks.clientId;
  const clientSecret = config.naverWorks.clientSecret;

  const payload = {
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  };

  let response = await makeTokenRequest(TOKEN_URL, payload);

  // 실패 시 재시도 (기존 while 루프 패턴)
  let retryCount = 0;
  const maxRetries = 3;

  while (!response && retryCount < maxRetries) {
    retryCount++;
    logger.warn(`Token request failed, retrying (${retryCount}/${maxRetries})...`);

    // DB에서 최신 refresh_token 다시 조회
    payload.refresh_token = await getEncryptedValue('REFRESH_TOKEN');
    response = await makeTokenRequest(TOKEN_URL, payload);
  }

  if (!response) {
    throw new Error('Failed to get access token after retries');
  }

  const { access_token, refresh_token } = response;

  // 새 토큰들을 DB에 저장
  await setEncryptedValue('ACCESS_TOKEN', access_token);
  await setEncryptedValue('REFRESH_TOKEN', refresh_token);

  logger.info('Access token refreshed and saved to DB');
  return access_token;
}

/**
 * 토큰 요청 함수 (기존 makeRequest 패턴 유지)
 */
async function makeTokenRequest(url: string, payload: Record<string, string>): Promise<TokenResponse | null> {
  try {
    const response = await axios.post<TokenResponse>(url, new URLSearchParams(payload), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`Token request error - Status: ${error.response?.status}`);
      logger.error(`Error message: ${error.response?.data?.error_description || error.message}`);
    } else {
      logger.error('Token request error:', error);
    }
    return null;
  }
}

/**
 * 저장된 Access Token 조회 (캐시용)
 */
export async function getStoredAccessToken(): Promise<string | null> {
  try {
    return await getEncryptedValue('ACCESS_TOKEN');
  } catch {
    return null;
  }
}
