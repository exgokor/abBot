import { TextMessageRequest } from './index';
import { logger } from '../utils/logger';
import { sendTextMessage, sendFlexMessage, createTextBubble, createButtonBubble } from '../services/naverworks/message';

/**
 * 텍스트 메시지 처리
 */
export async function handleTextMessage(request: TextMessageRequest): Promise<void> {
  const userId = request.source.userId;
  const text = request.content.text.trim();

  logger.info(`Text message from ${userId}: ${text}`);

  // 명령어 처리 (/, ! 로 시작하는 경우)
  if (text.startsWith('/') || text.startsWith('!')) {
    await handleCommand(userId, text);
    return;
  }

  // 일반 텍스트 처리
  await handleGeneralText(userId, text);
}

/**
 * 명령어 처리
 */
async function handleCommand(userId: string, text: string): Promise<void> {
  const command = text.slice(1).toLowerCase().split(' ')[0];
  const args = text.slice(1).split(' ').slice(1).join(' ');

  logger.info(`Command: ${command}, Args: ${args}`);

  switch (command) {
    case 'help':
    case '도움말':
      await sendHelpMessage(userId);
      break;

    case 'menu':
    case '메뉴':
      await sendMenuMessage(userId);
      break;

    case 'myinfo':
    case '내정보':
      await handleMyInfo(userId);
      break;

    default:
      await sendTextMessage(userId, `알 수 없는 명령어입니다: ${command}\n/help 를 입력하여 사용 가능한 명령어를 확인하세요.`);
  }
}

/**
 * 일반 텍스트 처리
 */
async function handleGeneralText(userId: string, text: string): Promise<void> {
  // 기본 응답 - 메뉴 안내
  const flexMessage = createButtonBubble(
    '무엇을 도와드릴까요?',
    [
      { label: '메뉴', text: '/menu' },
      { label: '도움말', text: '/help' },
    ]
  );

  await sendFlexMessage(userId, flexMessage);
}

/**
 * 도움말 메시지
 */
async function sendHelpMessage(userId: string): Promise<void> {
  const helpText = `[사용 가능한 명령어]

/menu - 메뉴 표시
/myinfo - 내 정보 조회
/help - 도움말

문의사항이 있으시면 관리자에게 연락해주세요.`;

  await sendTextMessage(userId, helpText);
}

/**
 * 메뉴 버튼
 */
async function sendMenuMessage(userId: string): Promise<void> {
  const flexMessage = createButtonBubble(
    '메뉴를 선택하세요',
    [
      { label: '내 정보', text: '/myinfo' },
      { label: '도움말', text: '/help' },
    ]
  );

  await sendFlexMessage(userId, flexMessage);
}

/**
 * 내 정보 조회
 */
async function handleMyInfo(userId: string): Promise<void> {
  // TODO: DB에서 사용자 정보 조회
  const flexMessage = createTextBubble(
    '내 정보',
    `사용자 ID: ${userId}\n\n상세 정보는 준비 중입니다.`
  );

  await sendFlexMessage(userId, flexMessage);
}
