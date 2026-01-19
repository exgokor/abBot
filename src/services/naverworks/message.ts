import axios from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getValidAccessToken } from './auth';
import { FlexibleTemplate, TextContent } from './types';

const API_BASE_URL = 'https://www.worksapis.com/v1.0';

export async function sendTextMessage(userId: string, text: string): Promise<void> {
  const content: TextContent = {
    contentType: 'text',
    content: { text },
  };

  await sendMessage(userId, content);
}

export async function sendFlexMessage(userId: string, flexContent: FlexibleTemplate): Promise<void> {
  await sendMessage(userId, flexContent);
}

async function sendMessage(userId: string, content: TextContent | FlexibleTemplate): Promise<void> {
  const accessToken = await getValidAccessToken();

  try {
    await axios.post(
      `${API_BASE_URL}/bots/${config.naverWorks.botId}/users/${userId}/messages`,
      content,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    logger.info(`Message sent to user: ${userId}`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`Failed to send message: ${error.response?.status} ${error.response?.data}`);

      // 401 에러시 토큰 갱신 후 재시도
      if (error.response?.status === 401) {
        logger.info('Token expired, will retry after refresh...');
        throw new Error('TOKEN_EXPIRED');
      }
    }
    throw error;
  }
}

// Flexible Template 헬퍼 함수
export function createTextBubble(title: string, content: string): FlexibleTemplate {
  return {
    contentType: 'flex',
    content: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: content,
            wrap: true,
            size: 'md',
          },
        ],
        spacing: 'md',
      },
    },
  };
}

export function createButtonBubble(
  title: string,
  buttons: Array<{ label: string; text: string }>
): FlexibleTemplate {
  return {
    contentType: 'flex',
    content: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'lg',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: buttons.map((btn) => ({
          type: 'button',
          action: {
            type: 'message',
            label: btn.label,
            text: btn.text,
          },
          style: 'primary',
        })),
        spacing: 'sm',
      },
    },
  };
}
