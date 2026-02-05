import axios from 'axios';
import { logger } from '../../utils/logger';
import { getAccessToken, refreshAccessToken } from '../naverworks/auth';

/**
 * 토큰 관리자 (Singleton)
 * - 동시 요청 시 중복 갱신 방지
 * - 401 에러 시 토큰 갱신 후 재시도
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
   * Access Token 조회 (캐시 우선)
   */
  async getToken(): Promise<string> {
    return await getAccessToken();
  }

  /**
   * 토큰 갱신 (중복 갱신 방지)
   */
  async refreshToken(): Promise<string> {
    // 이미 갱신 중이면 기존 Promise 반환 (중복 방지)
    if (this.isRefreshing && this.refreshPromise) {
      logger.debug('Token refresh in progress, waiting...');
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = refreshAccessToken();

    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * 토큰을 사용하는 작업 실행 (401 시 갱신 후 재시도)
   */
  async executeWithToken<T>(
    operation: (accessToken: string) => Promise<T>
  ): Promise<T> {
    // 1차 시도
    try {
      const token = await this.getToken();
      return await operation(token);
    } catch (error) {
      // 401 에러인 경우만 토큰 갱신 후 재시도
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        logger.info('Token expired, refreshing and retrying...');
        const newToken = await this.refreshToken();
        return await operation(newToken);
      }
      throw error;
    }
  }
}

export const tokenManager = TokenManager.getInstance();
