import { logger } from '../../utils/logger';
import { getAccessToken } from '../naverworks/auth';

/**
 * 토큰 관리자 (Singleton)
 * - 동시 요청 시 중복 갱신 방지
 * - 토큰 갱신 재시도 로직
 */
export class TokenManager {
  private static instance: TokenManager;
  private isRefreshing = false;
  private refreshPromise: Promise<string> | null = null;

  private constructor() {}

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  /**
   * Access Token 조회 (동시 요청 시 중복 갱신 방지)
   */
  async getToken(): Promise<string> {
    // 이미 갱신 중이면 기존 Promise 반환
    if (this.isRefreshing && this.refreshPromise) {
      logger.debug('Token refresh in progress, waiting...');
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.fetchToken();

    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async fetchToken(): Promise<string> {
    return await getAccessToken();
  }

  /**
   * 토큰을 사용하는 작업 실행 (실패 시 자동 재시도)
   */
  async executeWithToken<T>(
    operation: (accessToken: string) => Promise<T>,
    retries = 1
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const token = await this.getToken();
        return await operation(token);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < retries) {
          logger.warn(`Operation failed, retrying (${attempt + 1}/${retries})...`);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }
}

export const tokenManager = TokenManager.getInstance();
