import { logger } from '../../utils/logger';
import { getValidAccessToken, refreshAccessToken, getStoredToken } from '../naverworks/auth';
import { refreshTokenViaPuppeteer } from './puppeteer';

export class TokenManager {
  private static instance: TokenManager;
  private isRefreshing = false;

  private constructor() {}

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  async getAccessToken(): Promise<string> {
    try {
      return await getValidAccessToken();
    } catch (error) {
      logger.warn('Failed to get valid access token, attempting refresh...');
      return this.handleTokenRefresh();
    }
  }

  private async handleTokenRefresh(): Promise<string> {
    if (this.isRefreshing) {
      // 다른 요청에서 이미 갱신 중이면 대기
      await this.waitForRefresh();
      return this.getAccessToken();
    }

    this.isRefreshing = true;

    try {
      // 1단계: refresh_token으로 access_token 갱신 시도
      const storedToken = await getStoredToken();
      if (storedToken) {
        try {
          const newToken = await refreshAccessToken(storedToken.refreshToken);
          logger.info('Token refreshed via refresh_token');
          return newToken.access_token;
        } catch (refreshError) {
          logger.warn('Refresh token expired or invalid, trying Puppeteer...');
        }
      }

      // 2단계: Puppeteer로 브라우저 자동화하여 새 토큰 획득
      const puppeteerResult = await refreshTokenViaPuppeteer();
      if (puppeteerResult.success && puppeteerResult.accessToken) {
        logger.info('Token refreshed via Puppeteer');
        return puppeteerResult.accessToken;
      }

      throw new Error('All token refresh methods failed');
    } finally {
      this.isRefreshing = false;
    }
  }

  private async waitForRefresh(): Promise<void> {
    const maxWait = 60000; // 60초
    const interval = 1000; // 1초
    let waited = 0;

    while (this.isRefreshing && waited < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      waited += interval;
    }
  }

  async executeWithToken<T>(
    operation: (accessToken: string) => Promise<T>,
    retries = 1
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const token = await this.getAccessToken();
        return await operation(token);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (lastError.message === 'TOKEN_EXPIRED' && attempt < retries) {
          logger.info(`Token expired, retrying (attempt ${attempt + 1}/${retries})...`);
          // 토큰 갱신 후 재시도
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }
}

export const tokenManager = TokenManager.getInstance();
