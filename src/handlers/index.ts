import { logger } from '../utils/logger';
import { handleTextMessage } from './textHandler';
import { handlePostback } from './postbackHandler';

/**
 * 텍스트 메시지 요청 타입
 */
export interface TextMessageRequest {
  type: 'message';
  source: {
    userId: string;
    domainId: number;
  };
  issuedTime: string;
  content: {
    type: 'text';
    text: string;
  };
}

/**
 * Postback 요청 타입
 */
export interface PostbackRequest {
  type: 'postback';
  data: string; // JSON string
  source: {
    userId: string;
    channelId: string;
    domainId: number;
  };
  issuedTime: string;
}

export type BotRequest = TextMessageRequest | PostbackRequest;

/**
 * 메시지 핸들러 메인 라우터
 */
export async function handleBotRequest(request: BotRequest): Promise<void> {
  const userId = request.source.userId;

  logger.info(`Received ${request.type} from user: ${userId}`);

  try {
    if (request.type === 'message') {
      await handleTextMessage(request as TextMessageRequest);
    } else if (request.type === 'postback') {
      await handlePostback(request as PostbackRequest);
    } else {
      logger.warn(`Unknown request type: ${(request as any).type}`);
    }
  } catch (error) {
    logger.error(`Error handling request:`, error);
    throw error;
  }
}
