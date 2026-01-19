import axios from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getAccessToken } from './auth';
import { FlexibleTemplate, TextContent } from './types';

const API_BASE_URL = 'https://www.worksapis.com/v1.0';

export interface WorksUser {
  email: string;
  fullName: string;
  type: string;
  userID: string;
  birthday: string;
  birthType: string;
  positionName: string;
  level: string;
  position: string;
}

/**
 * NaverWorks 사용자 목록 조회
 */
export async function usersList(): Promise<WorksUser[]> {
  const accessToken = await getAccessToken();
  const getURL = `${API_BASE_URL}/users?domainId=${config.naverWorks.domainId}`;

  try {
    const response = await axios.get(getURL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const json = response.data;

    const list: WorksUser[] = json.users.map((js: any) => ({
      email: js.email,
      fullName: js.userName?.lastName + js.userName?.firstName,
      type: js.employmentTypeName || '',
      userID: js.userId,
      birthday: js.birthday || '',
      birthType: js.birthdayCalendarType || '',
      positionName: js.organizations?.[0]?.orgUnits?.[0]?.orgUnitName || '',
      level: js.organizations?.[0]?.levelName || '',
      position: js.organizations?.[0]?.orgUnits?.[0]?.positionName || '',
    }));

    logger.info(`Fetched ${list.length} users from NaverWorks`);
    return list;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`Failed to fetch users: ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
    }
    throw error;
  }
}

export async function sendTextMessage(userId: string, text: string): Promise<void> {
  // NaverWorks Bot API 형식: content.type = 'text'
  const body = {
    content: {
      type: 'text',
      text: text,
    },
  };

  await sendMessage(userId, body);
}

export async function sendFlexMessage(userId: string, flexContent: any): Promise<void> {
  // NaverWorks Bot API 형식: content.type = 'flex'
  const body = {
    content: {
      type: 'flex',
      altText: 'Flexible Template',
      contents: flexContent.content || flexContent,
    },
  };

  await sendMessage(userId, body);
}

async function sendMessage(userId: string, content: any): Promise<void> {
  const accessToken = await getAccessToken();

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
      logger.error(`Failed to send message: ${error.response?.status}`);
      logger.error(`Error detail: ${JSON.stringify(error.response?.data)}`);

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
