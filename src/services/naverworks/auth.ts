import axios from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { executeQuery } from '../database/queries';
import { TokenResponse, StoredToken } from './types';

const TOKEN_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token';

export async function getStoredToken(): Promise<StoredToken | null> {
  try {
    const result = await executeQuery<StoredToken>(
      `SELECT TOP 1 id, accessToken, refreshToken, expiresAt, updatedAt
       FROM NaverWorksTokens
       ORDER BY updatedAt DESC`
    );
    return result[0] || null;
  } catch (error) {
    logger.error('Failed to get stored token', error);
    return null;
  }
}

export async function saveToken(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  try {
    await executeQuery(
      `MERGE NaverWorksTokens AS target
       USING (SELECT 1 AS id) AS source ON target.id = 1
       WHEN MATCHED THEN
         UPDATE SET accessToken = @accessToken, refreshToken = @refreshToken,
                    expiresAt = @expiresAt, updatedAt = GETDATE()
       WHEN NOT MATCHED THEN
         INSERT (accessToken, refreshToken, expiresAt, updatedAt)
         VALUES (@accessToken, @refreshToken, @expiresAt, GETDATE());`,
      { accessToken, refreshToken, expiresAt }
    );
    logger.info('Token saved successfully');
  } catch (error) {
    logger.error('Failed to save token', error);
    throw error;
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  try {
    const response = await axios.post<TokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.naverWorks.clientId,
        client_secret: config.naverWorks.clientSecret,
        refresh_token: refreshToken,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const tokenData = response.data;

    await saveToken(
      tokenData.access_token,
      tokenData.refresh_token || refreshToken,
      tokenData.expires_in
    );

    logger.info('Access token refreshed successfully');
    return tokenData;
  } catch (error) {
    logger.error('Failed to refresh access token', error);
    throw error;
  }
}

export async function getValidAccessToken(): Promise<string> {
  const storedToken = await getStoredToken();

  if (!storedToken) {
    throw new Error('No stored token found. Please authenticate first.');
  }

  // 토큰 만료 5분 전에 갱신
  const now = new Date();
  const expiresAt = new Date(storedToken.expiresAt);
  const bufferTime = 5 * 60 * 1000; // 5 minutes

  if (now.getTime() + bufferTime < expiresAt.getTime()) {
    return storedToken.accessToken;
  }

  // 토큰 갱신 필요
  logger.info('Access token expired or expiring soon, refreshing...');
  const newToken = await refreshAccessToken(storedToken.refreshToken);
  return newToken.access_token;
}
