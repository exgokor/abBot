/**
 * DB 에러 처리 유틸리티
 * - DB 연결 에러 시 재시도 로직 제공
 */

import { logger } from './logger';
import { sendTextMessage } from '../services/naverworks/message';
import { isConnectionError, reconnect } from '../services/database/connection';

/**
 * DB 작업을 재시도 로직과 함께 실행
 * - DB 연결 에러인 경우에만 재시도
 * - 일반 에러는 바로 에러 메시지 전송
 *
 * @param userId 사용자 ID (에러 메시지 전송용)
 * @param operation 실행할 DB 작업
 * @param errorContext 에러 컨텍스트 (로그 및 메시지용, 예: "검색", "지역 조회")
 * @returns 작업 결과 또는 null (에러 발생 시)
 */
export async function withDbRetry<T>(
  userId: string,
  operation: () => Promise<T>,
  errorContext: string
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    // DB 연결 에러인 경우에만 재시도
    if (isConnectionError(error)) {
      logger.warn(`DB connection error during ${errorContext}, attempting reconnect...`);
      await sendTextMessage(userId, '잠시만 기다려주세요. 연결을 재시도합니다...');

      try {
        await reconnect();
        logger.info(`Reconnection successful, retrying ${errorContext}...`);
        return await operation(); // 재시도
      } catch (retryError) {
        logger.error(`DB reconnection failed during ${errorContext}:`, retryError);
        await sendTextMessage(userId, 'DB 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return null;
      }
    }

    // 일반 에러는 재시도 없이 바로 에러 메시지
    logger.error(`${errorContext} error:`, error);
    await sendTextMessage(userId, `${errorContext} 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`);
    return null;
  }
}
