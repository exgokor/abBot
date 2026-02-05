import axios from 'axios';
import puppeteer from 'puppeteer';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { getEncryptedValue, setEncryptedValue } from '../database/envDB';

// 토큰 재발행 알림을 받을 관리자 ID
const ADMIN_NOTIFY_USER_ID = '73524122-e756-4c53-179e-0378b4ad90b5';

const TOKEN_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token';

// 메모리 토큰 캐시 (매번 DB 조회 방지)
let cachedAccessToken: string | null = null;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Access Token 발급
 * - 메모리 캐시 우선
 * - 없으면 DB 조회
 * - DB에도 없으면 refresh_token으로 갱신
 */
export async function getAccessToken(): Promise<string> {
  // 1. 메모리 캐시
  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  // 2. DB에서 조회
  try {
    const storedToken = await getEncryptedValue('ACCESS_TOKEN');
    if (storedToken) {
      cachedAccessToken = storedToken;
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
    // RefreshToken도 만료됨 → Puppeteer로 재발행
    logger.warn('Refresh token expired, reissuing via Puppeteer...');
    return await reissueRefreshToken();
  }

  const { access_token, refresh_token } = response;

  // 새 토큰들을 DB에 저장 + 메모리 캐시 업데이트
  await setEncryptedValue('ACCESS_TOKEN', access_token);
  await setEncryptedValue('REFRESH_TOKEN', refresh_token);
  cachedAccessToken = access_token;

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

/**
 * Puppeteer로 로그인하여 authorization code 획득
 */
async function getAuthCode(): Promise<{ browser: any; authCode: string }> {
  logger.info('Starting Puppeteer to get auth code...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();

  const authUrl = `${config.naverWorks.authUrl}&client_id=${config.naverWorks.clientId}&redirect_uri=${config.naverWorks.redirectUri}`;
  logger.info(`Auth URL: ${authUrl}`);

  await page.goto(authUrl);

  // ID 입력
  await page.waitForSelector('#user_id');
  await page.type('#user_id', config.naverWorks.adminId);

  // Password 입력
  await page.waitForSelector('#user_pwd');
  await page.type('#user_pwd', config.naverWorks.adminPw);

  // 로그인 버튼 클릭 및 리다이렉트 대기
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('#loginBtn'),
  ]);

  const currentUrl = page.url();
  logger.info(`Redirected URL: ${currentUrl}`);

  // URL에서 code 파라미터 추출
  const urlParams = new URL(currentUrl).searchParams;
  const authCode = urlParams.get('code');

  if (!authCode) {
    await browser.close();
    throw new Error('인증 코드를 찾을 수 없습니다');
  }

  logger.info('Auth code obtained successfully');
  return { browser, authCode };
}

/**
 * Puppeteer로 RefreshToken 재발행
 */
export async function reissueRefreshToken(): Promise<string> {
  logger.info('Reissuing refresh token via Puppeteer...');

  const { browser, authCode } = await getAuthCode();

  const payload = {
    code: authCode,
    grant_type: 'authorization_code',
    client_id: config.naverWorks.clientId,
    client_secret: config.naverWorks.clientSecret,
  };

  const response = await makeTokenRequest(TOKEN_URL, payload);
  await browser.close();

  if (!response) {
    throw new Error('Failed to reissue refresh token');
  }

  const { access_token, refresh_token } = response;
  await setEncryptedValue('ACCESS_TOKEN', access_token);
  await setEncryptedValue('REFRESH_TOKEN', refresh_token);

  logger.info('Refresh token reissued and saved to DB');

  // 관리자에게 토큰 재발행 알림 전송
  try {
    await sendTokenReissueNotification(access_token);
  } catch (notifyError) {
    logger.error('Failed to send token reissue notification:', notifyError);
  }

  return access_token;
}

/**
 * 토큰 재발행 알림 메시지 전송
 */
async function sendTokenReissueNotification(accessToken: string): Promise<void> {
  const API_BASE_URL = 'https://www.worksapis.com/v1.0';
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  const body = {
    content: {
      type: 'text',
      text: `[토큰 재발행 알림]\nPuppeteer를 통해 토큰이 재발행되었습니다.\n시간: ${now}`,
    },
  };

  await axios.post(
    `${API_BASE_URL}/bots/${config.naverWorks.botId}/users/${ADMIN_NOTIFY_USER_ID}/messages`,
    body,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info(`Token reissue notification sent to admin: ${ADMIN_NOTIFY_USER_ID}`);
}
