import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { WebhookMessage } from '../services/naverworks/types';
import { sendTextMessage, sendFlexMessage, createTextBubble, createButtonBubble } from '../services/naverworks/message';
import { getUserPermission, UserRole } from '../middleware/permission';
import { executeQuery } from '../services/database/queries';

export async function handleMessage(req: Request, res: Response): Promise<void> {
  try {
    const message: WebhookMessage = req.body;

    logger.info(`Received message from user: ${message.source.userId}`);
    logger.debug(`Message content: ${JSON.stringify(message.content)}`);

    // 빠른 응답 (NaverWorks는 빠른 200 응답 필요)
    res.status(200).json({ success: true });

    // 메시지 처리 (비동기)
    processMessage(message).catch((error) => {
      logger.error('Error processing message:', error);
    });
  } catch (error) {
    logger.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function processMessage(message: WebhookMessage): Promise<void> {
  const userId = message.source.userId;
  const text = message.content.text?.trim() || '';
  const postback = message.content.postback;

  // 유저 권한 조회
  const permission = await getUserPermission(userId);
  const role = permission?.role || UserRole.USER;

  // 명령어 처리
  if (text.startsWith('/') || postback) {
    await handleCommand(userId, text || postback || '', role);
    return;
  }

  // 기본 응답
  await sendWelcomeMessage(userId, role);
}

async function handleCommand(userId: string, command: string, role: UserRole): Promise<void> {
  const cmd = command.toLowerCase().replace('/', '');

  switch (cmd) {
    case 'help':
    case '도움말':
      await sendHelpMessage(userId, role);
      break;

    case 'myinfo':
    case '내정보':
      await handleMyInfo(userId);
      break;

    case 'list':
    case '목록':
      await handleList(userId, role);
      break;

    case 'menu':
    case '메뉴':
      await sendMenuButtons(userId, role);
      break;

    default:
      // 기타 명령어 처리
      if (cmd.startsWith('search ') || cmd.startsWith('검색 ')) {
        const query = cmd.replace(/^(search |검색 )/, '');
        await handleSearch(userId, query, role);
      } else if (cmd.startsWith('update ') && role === UserRole.SUPER_ADMIN) {
        const params = cmd.replace('update ', '');
        await handleUpdate(userId, params);
      } else {
        await sendTextMessage(userId, '알 수 없는 명령어입니다. /help 를 입력하여 사용 가능한 명령어를 확인하세요.');
      }
  }
}

async function sendWelcomeMessage(userId: string, role: UserRole): Promise<void> {
  const roleText = {
    [UserRole.USER]: '일반 사용자',
    [UserRole.ADMIN]: '관리자',
    [UserRole.SUPER_ADMIN]: '최종 관리자',
  };

  const flexMessage = createTextBubble(
    '환영합니다!',
    `현재 권한: ${roleText[role]}\n\n/menu 또는 /help 를 입력하여 사용 가능한 기능을 확인하세요.`
  );

  await sendFlexMessage(userId, flexMessage);
}

async function sendHelpMessage(userId: string, role: UserRole): Promise<void> {
  let helpText = `[사용 가능한 명령어]\n\n`;
  helpText += `/menu - 메뉴 버튼 표시\n`;
  helpText += `/myinfo - 내 정보 조회\n`;
  helpText += `/help - 도움말\n`;

  if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) {
    helpText += `\n[관리자 명령어]\n`;
    helpText += `/list - 전체 목록 조회\n`;
    helpText += `/검색 [키워드] - 검색\n`;
  }

  if (role === UserRole.SUPER_ADMIN) {
    helpText += `\n[최종관리자 명령어]\n`;
    helpText += `/update [파라미터] - 데이터 수정\n`;
  }

  await sendTextMessage(userId, helpText);
}

async function sendMenuButtons(userId: string, role: UserRole): Promise<void> {
  const buttons = [
    { label: '내 정보', text: '/myinfo' },
    { label: '도움말', text: '/help' },
  ];

  if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) {
    buttons.push({ label: '전체 목록', text: '/list' });
  }

  const flexMessage = createButtonBubble('메뉴를 선택하세요', buttons);
  await sendFlexMessage(userId, flexMessage);
}

async function handleMyInfo(userId: string): Promise<void> {
  try {
    // 사용자 정보 조회 (실제 테이블명과 컬럼은 환경에 맞게 수정)
    const result = await executeQuery<Record<string, unknown>>(
      `SELECT * FROM UserInfo WHERE userId = @userId`,
      { userId }
    );

    if (result.length === 0) {
      await sendTextMessage(userId, '등록된 정보가 없습니다.');
      return;
    }

    const userInfo = result[0];
    const infoText = Object.entries(userInfo)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    const flexMessage = createTextBubble('내 정보', infoText);
    await sendFlexMessage(userId, flexMessage);
  } catch (error) {
    logger.error('Error fetching user info:', error);
    await sendTextMessage(userId, '정보 조회 중 오류가 발생했습니다.');
  }
}

async function handleList(userId: string, role: UserRole): Promise<void> {
  if (role === UserRole.USER) {
    await sendTextMessage(userId, '권한이 없습니다.');
    return;
  }

  try {
    // 전체 목록 조회 (실제 테이블명과 컬럼은 환경에 맞게 수정)
    const result = await executeQuery<Record<string, unknown>>(
      `SELECT TOP 10 * FROM UserInfo ORDER BY createdAt DESC`
    );

    if (result.length === 0) {
      await sendTextMessage(userId, '조회된 데이터가 없습니다.');
      return;
    }

    let listText = `[최근 목록 (${result.length}건)]\n\n`;
    result.forEach((item, index) => {
      listText += `${index + 1}. ${JSON.stringify(item)}\n`;
    });

    await sendTextMessage(userId, listText);
  } catch (error) {
    logger.error('Error fetching list:', error);
    await sendTextMessage(userId, '목록 조회 중 오류가 발생했습니다.');
  }
}

async function handleSearch(userId: string, query: string, role: UserRole): Promise<void> {
  if (role === UserRole.USER) {
    // 일반 유저는 본인 정보만 검색
    await handleMyInfo(userId);
    return;
  }

  try {
    // 검색 쿼리 (실제 테이블과 컬럼은 환경에 맞게 수정)
    const result = await executeQuery<Record<string, unknown>>(
      `SELECT * FROM UserInfo WHERE name LIKE @query OR userId LIKE @query`,
      { query: `%${query}%` }
    );

    if (result.length === 0) {
      await sendTextMessage(userId, `'${query}'에 대한 검색 결과가 없습니다.`);
      return;
    }

    let searchText = `[검색 결과: ${query}] (${result.length}건)\n\n`;
    result.forEach((item, index) => {
      searchText += `${index + 1}. ${JSON.stringify(item)}\n`;
    });

    await sendTextMessage(userId, searchText);
  } catch (error) {
    logger.error('Error searching:', error);
    await sendTextMessage(userId, '검색 중 오류가 발생했습니다.');
  }
}

async function handleUpdate(userId: string, params: string): Promise<void> {
  // 최종관리자만 사용 가능 (호출 전에 권한 체크됨)
  try {
    // 파라미터 파싱 예시: "table=Users field=status value=active where=userId:123"
    const parsed = parseUpdateParams(params);

    if (!parsed) {
      await sendTextMessage(userId, '잘못된 형식입니다. 예: update table=Users field=status value=active where=userId:123');
      return;
    }

    // 실제 업데이트 쿼리 실행
    // 주의: SQL Injection 방지를 위해 실제 운영에서는 더 엄격한 검증 필요
    await executeQuery(
      `UPDATE ${parsed.table} SET ${parsed.field} = @value WHERE ${parsed.whereField} = @whereValue`,
      { value: parsed.value, whereValue: parsed.whereValue }
    );

    await sendTextMessage(userId, `업데이트 완료: ${parsed.table}.${parsed.field} = ${parsed.value}`);
    logger.info(`SUPER_ADMIN ${userId} updated ${parsed.table}.${parsed.field}`);
  } catch (error) {
    logger.error('Error updating:', error);
    await sendTextMessage(userId, '업데이트 중 오류가 발생했습니다.');
  }
}

function parseUpdateParams(params: string): {
  table: string;
  field: string;
  value: string;
  whereField: string;
  whereValue: string;
} | null {
  const parts = params.split(' ');
  const result: Record<string, string> = {};

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      result[key] = value;
    }
  }

  if (!result.table || !result.field || !result.value || !result.where) {
    return null;
  }

  const [whereField, whereValue] = result.where.split(':');
  if (!whereField || !whereValue) {
    return null;
  }

  return {
    table: result.table,
    field: result.field,
    value: result.value,
    whereField,
    whereValue,
  };
}
