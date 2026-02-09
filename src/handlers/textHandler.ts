/**
 * 텍스트 메시지 핸들러 (V2)
 * Depth1: 검색 로직
 */

import { TextMessageRequest } from "./index";
import { logger } from "../utils/logger";
import {
  sendTextMessage,
  sendFlexMessage,
  createTextBubble,
  createButtonBubble,
} from "../services/naverworks/message";
import {
  searchAll,
  getTotalCount,
  isSingleResult,
  isTooManyResults,
  getSingleEntity,
  createSearchResultCarousel,
} from "../services/sales/searchService";
import { getCurrentPeriod } from "../services/sales/periodService";
import { withDbRetry } from "../utils/dbErrorHandler";
import { handleDepth2 } from "./postbackHandler";
import { getUserPermission, getUserAllowedEntities, UserRole } from "../middleware/permission";

/**
 * 텍스트 메시지 처리
 */
export async function handleTextMessage(
  request: TextMessageRequest,
): Promise<void> {
  const userId = request.source.userId;
  const text = request.content.text.trim();

  logger.info(`Text message from ${userId}: ${text}`);

  // 환영 메시지 (시작하기, ? 입력 시)
  const welcomeKeywords = ["시작하기", "?"];
  if (welcomeKeywords.includes(text)) {
    await sendWelcomeMessage(userId);
    return;
  }

  // 명령어 처리 (/, ! 로 시작하는 경우)
  if (text.startsWith("/") || text.startsWith("!")) {
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
  const command = text.slice(1).toLowerCase().split(" ")[0];
  const args = text.slice(1).split(" ").slice(1).join(" ");

  logger.info(`Command: ${command}, Args: ${args}`);

  switch (command) {
    case "help":
    case "도움말":
      await sendHelpMessage(userId);
      break;

    case "menu":
    case "메뉴":
      await sendMenuMessage(userId);
      break;

    case "myinfo":
    case "내정보":
      await handleMyInfo(userId);
      break;

    default:
      await sendTextMessage(
        userId,
        `알 수 없는 명령어입니다: ${command}\n/help 를 입력하여 사용 가능한 명령어를 확인하세요.`,
      );
  }
}

/**
 * Depth1: 통합 검색
 * - 결과 0개: 재입력 요청
 * - 결과 1개: 바로 Depth2로 이동
 * - 결과 2~20개: 카테고리별 캐러셀 표시
 * - 결과 21개+: 더 정확한 검색어 요청
 */
async function handleDepth1Search(
  userId: string,
  keyword: string,
): Promise<void> {
  const t0 = Date.now();

  // 즉시 안내 메시지 전송 (await 없이 fire-and-forget)
  sendTextMessage(userId, `[ ${keyword} ] 검색 중...`);

  // 권한 조회를 검색과 병렬 실행
  const [period, permission] = await Promise.all([
    withDbRetry(userId, () => getCurrentPeriod(3), "기간 조회"),
    getUserPermission(userId),
  ]);

  if (!period) return;

  const isAdmin =
    permission?.role === UserRole.ADMIN ||
    permission?.role === UserRole.SUPER_ADMIN;
  const isSuperAdmin = permission?.role === UserRole.SUPER_ADMIN;
  const isUser = permission?.role === UserRole.USER;

  // USER일 경우 허용 엔티티 조회 후 필터링된 검색 실행
  const allowedEntities = isUser ? await getUserAllowedEntities(userId) : undefined;
  const searchResult = await withDbRetry(
    userId,
    () => searchAll(keyword, allowedEntities || undefined),
    "검색",
  );
  logger.info(`[PERF] 기간+권한+검색: ${Date.now() - t0}ms`);

  if (!searchResult) return;

  const totalCount = getTotalCount(searchResult);

  // Case 1: 결과 없음
  if (totalCount === 0) {
    await sendTextMessage(
      userId,
      `"${keyword}" 검색 결과가 없습니다.\n다른 검색어를 입력해주세요.`,
    );
    return;
  }

  // Case 2: 결과가 너무 많음 (21개 이상)
  if (isTooManyResults(searchResult)) {
    await sendTextMessage(
      userId,
      `"${keyword}" 검색 결과가 ${totalCount}건으로 너무 많습니다.\n검색어를 더 정확하게 입력해주세요.`,
    );
    return;
  }

  // Case 3: 단일 결과 → 바로 Depth2로 (중간 검색결과 화면 패스)
  if (isSingleResult(searchResult)) {
    const entity = getSingleEntity(searchResult);
    if (entity) {
      await sendTextMessage(
        userId,
        `"${entity.search_name}" 매출 데이터를 집계하고 있습니다...`,
      );

      // Depth2 직접 호출 (USER일 경우 CSO 코드 전달)
      const t3 = Date.now();
      await handleDepth2(
        userId,
        entity.entity_type,
        entity.entity_cd,
        period,
        isAdmin,
        isSuperAdmin,
        isUser ? allowedEntities?.csoCodes : undefined,
      );
      logger.info(`[PERF] Depth2전체: ${Date.now() - t3}ms`);
      return;
    }
  }

  // Case 4: 복수 결과 (2~20개) → 캐러셀 표시
  const carousel = createSearchResultCarousel(
    keyword,
    searchResult,
    period.periodText,
  );
  await sendFlexMessage(userId, carousel, `[${keyword}] 검색 완료`);

  logger.info(`Search carousel sent for "${keyword}" (${totalCount} results)`);
}

/**
 * 환영 메시지 (시작하기, ? 입력 시)
 */
async function sendWelcomeMessage(userId: string): Promise<void> {
  const welcomeMessage = `📱 매출조회 챗봇 사용법

검색어를 입력하세요!

🏥 병원명 입력 → 해당 병원 매출 조회
👤 CSO명 입력 → 해당 CSO 매출 조회
💊 품목명 입력 → 해당 품목 매출 조회

예시: 서울대병원, 홍길동, 타이레놀`;

  await sendTextMessage(userId, welcomeMessage);
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
  const flexMessage = createButtonBubble("메뉴를 선택하세요", [
    { label: "내 정보", text: "/myinfo" },
    { label: "도움말", text: "/help" },
  ]);

  await sendFlexMessage(userId, flexMessage, "메뉴");
}

/**
 * 내 정보 조회
 */
async function handleMyInfo(userId: string): Promise<void> {
  const flexMessage = createTextBubble(
    "내 정보",
    `사용자 ID: ${userId}\n\n상세 정보는 준비 중입니다.`,
  );

  await sendFlexMessage(userId, flexMessage, "내 정보");
}
