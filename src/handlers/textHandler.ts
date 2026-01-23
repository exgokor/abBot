import { TextMessageRequest } from './index';
import { logger } from '../utils/logger';
import { sendTextMessage, sendFlexMessage, createTextBubble, createButtonBubble } from '../services/naverworks/message';
import { getRegionSales, createRegionCarousel } from '../services/sales/regionSales';
import { searchAll, getTotalCount, isSingleResult, createSearchResultCarousel, getCategoryTrend } from '../services/sales/searchService';
import { getHospitalSales, createHospitalCarousel } from '../services/sales/hospitalSales';
import { getDrugSales, createDrugCarousel } from '../services/sales/drugSales';
import { getCsoSales, createCsoCarousel } from '../services/sales/csoSales';

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
 * 일반 텍스트 처리 - 통합 검색
 */
async function handleGeneralText(userId: string, text: string): Promise<void> {
  try {
    // 즉시 안내 메시지 전송
    await sendTextMessage(userId, `[ ${text} ] 로 결과를 검색합니다.`);

    // 통합 검색 실행 (지역/병원/약품/CSO)
    const searchResult = await searchAll(text);
    const totalCount = getTotalCount(searchResult);

    // 결과 없음
    if (totalCount === 0) {
      await sendTextMessage(userId, `[${text}] 검색 결과가 없습니다.`);
      return;
    }

    // 단일 결과 → 바로 상세 조회
    if (isSingleResult(searchResult)) {
      if (searchResult.regions.length === 1) {
        await handleRegionSearch(userId, searchResult.regions[0].hosIndex);
      } else if (searchResult.hospitals.length === 1) {
        const h = searchResult.hospitals[0];
        await handleHospitalSearch(userId, h.hos_cd, h.hos_cso_cd);
      } else if (searchResult.drugs.length === 1) {
        await handleDrugSearch(userId, searchResult.drugs[0].drug_cd);
      } else if (searchResult.csos.length === 1) {
        await handleCsoSearch(userId, searchResult.csos[0].cso_cd);
      }
      return;
    }

    // 복수 결과 → 선택 캐러셀
    // 검색 결과가 있는 모든 카테고리에 대해 트렌드 데이터 조회 (매출 요약 버블용)
    const trendData: {
      region?: Awaited<ReturnType<typeof getCategoryTrend>>;
      hospital?: Awaited<ReturnType<typeof getCategoryTrend>>;
      drug?: Awaited<ReturnType<typeof getCategoryTrend>>;
      cso?: Awaited<ReturnType<typeof getCategoryTrend>>;
    } = {};

    const trendPromises: Promise<void>[] = [];

    if (searchResult.regionTotalCount > 0) {
      trendPromises.push(
        getCategoryTrend('region', text, searchResult).then(data => { trendData.region = data; })
      );
    }
    if (searchResult.hospitalTotalCount > 0) {
      trendPromises.push(
        getCategoryTrend('hospital', text, searchResult).then(data => { trendData.hospital = data; })
      );
    }
    if (searchResult.drugTotalCount > 0) {
      trendPromises.push(
        getCategoryTrend('drug', text, searchResult).then(data => { trendData.drug = data; })
      );
    }
    if (searchResult.csoTotalCount > 0) {
      trendPromises.push(
        getCategoryTrend('cso', text, searchResult).then(data => { trendData.cso = data; })
      );
    }

    await Promise.all(trendPromises);

    const carousel = createSearchResultCarousel(text, searchResult, trendData);
    await sendFlexMessage(userId, carousel, `[${text}] 분석 완료`);

  } catch (error) {
    logger.error(`Search error for "${text}":`, error);
    await sendTextMessage(userId, '검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
}

/**
 * 지역 매출 조회
 */
async function handleRegionSearch(userId: string, keyword: string): Promise<void> {
  logger.info(`Region search: ${keyword} for user ${userId}`);

  try {
    const result = await getRegionSales(keyword);

    if (!result) {
      await sendTextMessage(userId, `'${keyword}' 지역의 매출 데이터가 없습니다.`);
      return;
    }

    const carousel = createRegionCarousel(keyword, result);
    await sendFlexMessage(userId, carousel, `[${keyword}] 분석 완료`);

    logger.info(`Region carousel sent for ${keyword}`);
  } catch (error) {
    logger.error(`Region search error:`, error);
    await sendTextMessage(userId, `지역 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`);
  }
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

  await sendFlexMessage(userId, flexMessage, '메뉴');
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

  await sendFlexMessage(userId, flexMessage, '내 정보');
}

/**
 * 병원 매출 조회
 */
export async function handleHospitalSearch(userId: string, hos_cd: string, hos_cso_cd: string): Promise<void> {
  logger.info(`Hospital search: ${hos_cd}|${hos_cso_cd} for user ${userId}`);

  try {
    const result = await getHospitalSales(hos_cd, hos_cso_cd);

    if (!result) {
      await sendTextMessage(userId, '해당 병원의 매출 데이터가 없습니다.');
      return;
    }

    const carousel = createHospitalCarousel(result);
    await sendFlexMessage(userId, carousel, `[${result.hospital.hos_abbr || result.hospital.hos_name}] 분석 완료`);

    logger.info(`Hospital carousel sent for ${hos_cd}|${hos_cso_cd}`);
  } catch (error) {
    logger.error(`Hospital search error:`, error);
    await sendTextMessage(userId, '병원 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
}

/**
 * 약품 매출 조회
 */
export async function handleDrugSearch(userId: string, drug_cd: string): Promise<void> {
  logger.info(`Drug search: ${drug_cd} for user ${userId}`);

  try {
    const result = await getDrugSales(drug_cd);

    if (!result) {
      await sendTextMessage(userId, '해당 약품의 매출 데이터가 없습니다.');
      return;
    }

    const carousel = createDrugCarousel(result);
    await sendFlexMessage(userId, carousel, `[${result.drug.drug_name}] 분석 완료`);

    logger.info(`Drug carousel sent for ${drug_cd}`);
  } catch (error) {
    logger.error(`Drug search error:`, error);
    await sendTextMessage(userId, '약품 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
}

/**
 * CSO 매출 조회
 */
export async function handleCsoSearch(userId: string, cso_cd: string): Promise<void> {
  logger.info(`CSO search: ${cso_cd} for user ${userId}`);

  try {
    const result = await getCsoSales(cso_cd);

    if (!result) {
      await sendTextMessage(userId, '해당 CSO의 매출 데이터가 없습니다.');
      return;
    }

    const carousel = createCsoCarousel(result);
    await sendFlexMessage(userId, carousel, `[${result.cso.cso_dealer_nm}] 분석 완료`);

    logger.info(`CSO carousel sent for ${cso_cd}`);
  } catch (error) {
    logger.error(`CSO search error:`, error);
    await sendTextMessage(userId, 'CSO 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
}
