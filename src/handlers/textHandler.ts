/**
 * 텍스트 메시지 핸들러 (V2)
 * Depth1: 검색 로직
 */

import { TextMessageRequest } from './index';
import { logger } from '../utils/logger';
import { sendTextMessage, sendFlexMessage, createTextBubble, createButtonBubble } from '../services/naverworks/message';
import {
  searchAll,
  getTotalCount,
  isSingleResult,
  isTooManyResults,
  getSingleEntity,
  createSearchResultCarousel,
} from '../services/sales/searchService';
import { getCurrentPeriod } from '../services/sales/periodService';
import { withDbRetry } from '../utils/dbErrorHandler';
import { handleDepth2 } from './postbackHandler';

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

  // 일반 텍스트 처리 (Depth1 검색)
  await handleDepth1Search(userId, text);
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
 * Depth1: 통합 검색
 * - 결과 0개: 재입력 요청
 * - 결과 1개: 바로 Depth2로 이동
 * - 결과 2~20개: 카테고리별 캐러셀 표시
 * - 결과 21개+: 더 정확한 검색어 요청
 */
async function handleDepth1Search(userId: string, keyword: string): Promise<void> {
  // 즉시 안내 메시지 전송
  await sendTextMessage(userId, `[ ${keyword} ] 검색 중...`);

  // 기간 정보 조회
  const period = await withDbRetry(
    userId,
    () => getCurrentPeriod(3),
    '기간 조회'
  );

  if (!period) return;

  // 통합 검색 실행
  const searchResult = await withDbRetry(
    userId,
    () => searchAll(keyword),
    '검색'
  );

  if (!searchResult) return;

  const totalCount = getTotalCount(searchResult);

  // Case 1: 결과 없음
  if (totalCount === 0) {
    await sendTextMessage(userId, `"${keyword}" 검색 결과가 없습니다.\n다른 검색어를 입력해주세요.`);
    return;
  }

  // Case 2: 결과가 너무 많음 (21개 이상)
  if (isTooManyResults(searchResult)) {
    await sendTextMessage(
      userId,
      `"${keyword}" 검색 결과가 ${totalCount}건으로 너무 많습니다.\n검색어를 더 정확하게 입력해주세요.`
    );
    return;
  }

  // Case 3: 단일 결과 → 바로 Depth2로 (중간 검색결과 화면 패스)
  if (isSingleResult(searchResult)) {
    const entity = getSingleEntity(searchResult);
    if (entity) {
      await sendTextMessage(userId, `"${entity.search_name}" 조회 중...`);
      // Depth2 직접 호출
      await handleDepth2(userId, entity.entity_type, entity.entity_cd, period);
      return;
    }
  }

  // Case 4: 복수 결과 (2~20개) → 캐러셀 표시
  const carousel = createSearchResultCarousel(keyword, searchResult, period.periodText);
  await sendFlexMessage(userId, carousel, `[${keyword}] 검색 완료`);

  logger.info(`Search carousel sent for "${keyword}" (${totalCount} results)`);
}

/**
 * 도움말 메시지
 */
async function sendHelpMessage(userId: string): Promise<void> {
  const helpText = `[매출 조회 챗봇 사용법]

검색어를 입력하면 CSO, 병원, 품목을 검색합니다.

예시:
- "삼성" → 삼성 관련 병원/CSO/품목 검색
- "아스피린" → 아스피린 관련 품목 검색

/menu - 메뉴 표시
/myinfo - 내 정보 조회
/help - 도움말`;

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

  await sendFlexMessage(userId, flexMessage, '메뉴');
}

/**
 * 내 정보 조회
 */
async function handleMyInfo(userId: string): Promise<void> {
  const flexMessage = createTextBubble(
    '내 정보',
    `사용자 ID: ${userId}\n\n상세 정보는 준비 중입니다.`
  );

  await sendFlexMessage(userId, flexMessage, '내 정보');
}
