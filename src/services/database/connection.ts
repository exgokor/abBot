import sql from 'mssql';
import { sqlConfig } from '../../config/database';
import { logger } from '../../utils/logger';

let pool: sql.ConnectionPool | null = null;

/**
 * 지연 함수 (재시도 간격용)
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getConnection(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  try {
    pool = await sql.connect(sqlConfig);
    logger.info('MSSQL connection established');
    return pool;
  } catch (error) {
    logger.error('MSSQL connection failed:', error);
    throw error;
  }
}

export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    logger.info('MSSQL connection closed');
  }
}

/**
 * DB 재연결 시도 (지수 백오프)
 * @param maxRetries 최대 재시도 횟수 (기본 3)
 */
export async function reconnect(maxRetries: number = 3): Promise<sql.ConnectionPool> {
  // 기존 연결 정리
  if (pool) {
    try {
      await pool.close();
    } catch {
      // 이미 닫혀있거나 에러 발생 시 무시
    }
    pool = null;
  }

  // 재시도 로직 (지수 백오프: 1초, 2초, 3초...)
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      pool = await sql.connect(sqlConfig);
      logger.info(`MSSQL reconnection successful (attempt ${attempt}/${maxRetries})`);
      return pool;
    } catch (error) {
      logger.error(`Reconnect attempt ${attempt}/${maxRetries} failed:`, error);
      if (attempt < maxRetries) {
        const waitTime = 1000 * attempt;
        logger.info(`Waiting ${waitTime}ms before next attempt...`);
        await delay(waitTime);
      }
    }
  }

  throw new Error('DB reconnection failed after max retries');
}

/**
 * DB 연결 에러 판별
 */
export function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const errorName = error.name || '';
    const errorMessage = error.message || '';

    return (
      errorName === 'ConnectionError' ||
      errorMessage.includes('Failed to connect') ||
      errorMessage.includes('Connection lost') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('ENOTFOUND')
    );
  }
  return false;
}
