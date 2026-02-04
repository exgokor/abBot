import { PostbackRequest } from './index';
import { logger } from '../utils/logger';
import { sendTextMessage, sendFlexMessage } from '../services/naverworks/message';
import { getCsoSales, createCsoCarousel } from '../services/sales/csoSales';
import {
  getHospitalSales,
  createHospitalCarousel,
  getHospitalSummary,
  getHospitalDetails,
  createSummaryCarousel,
  createDetailCarousel
} from '../services/sales/hospitalSales';
import { getDrugSales, createDrugCarousel } from '../services/sales/drugSales';
import {
  getCsoHospitalSalesExtended,
  getCsoDrugSalesExtended,
  getHospitalDrugSalesExtended,
  getHospitalCsoSalesExtended,
  getDrugHospitalSalesExtended,
  getDrugCsoSalesExtended,
  createCompositeCarousel
} from '../services/sales/compositeService';
import { decodePostback, PostbackData, parseDepth3Code, Depth3EntityType } from '../types/postback';
import { getCurrentPeriod } from '../services/sales/periodService';
import { withDbRetry } from '../utils/dbErrorHandler';
import { getUserPermission, UserRole } from '../middleware/permission';

/**
 * Postback 메시지 처리
 */
export async function handlePostback(request: PostbackRequest): Promise<void> {
  const userId = request.source.userId;
  const rawData = request.data;

  logger.info(`Postback from ${userId}: ${rawData}`);

  // 새 형식 postback 시도
  const postback = decodePostback(rawData);
  if (postback) {
    await handleNewFormatPostback(userId, postback);
    return;
  }

  // 기존 형식 postback 시도 (하위 호환)
  try {
    const legacyData = JSON.parse(rawData);
    await handleLegacyPostback(userId, legacyData);
  } catch {
    logger.error(`Failed to parse postback data: ${rawData}`);
    await sendTextMessage(userId, '요청 처리 중 오류가 발생했습니다.');
  }
}

/**
 * 새 형식 postback 처리 (d, t, c)
 */
async function handleNewFormatPostback(userId: string, postback: PostbackData): Promise<void> {
  const { d: depth, t: type, c: code } = postback;

  logger.info(`New format postback: depth=${depth}, type=${type}, code=${code}`);

  const period = await getCurrentPeriod(3);

  // 권한 조회 (DRUG 타입일 때 관리자 수수료율 표시 여부 결정)
  const permission = await getUserPermission(userId);
  const isAdmin = permission?.role === UserRole.ADMIN || permission?.role === UserRole.SUPER_ADMIN;
  const isSuperAdmin = permission?.role === UserRole.SUPER_ADMIN;

  if (depth === 2) {
    await handleDepth2(userId, type, code, period, isAdmin, isSuperAdmin);
  } else if (depth === 3) {
    await handleDepth3(userId, type, code, period);
  } else {
    logger.warn(`Unknown depth: ${depth}`);
    await sendTextMessage(userId, '알 수 없는 요청입니다.');
  }
}

/**
 * Depth2 단일 엔티티 조회
 * @export textHandler에서 단일 검색결과 시 직접 호출
 * @param isAdmin 관리자 여부 (DRUG 조회 시 관리자용 수수료율 표시)
 * @param isSuperAdmin SUPER_ADMIN 여부 (HOSPITAL 조회 시 블록 수정 버튼 표시)
 */
export async function handleDepth2(
  userId: string,
  type: string,
  code: string,
  period: any,
  isAdmin: boolean = false,
  isSuperAdmin: boolean = false
): Promise<void> {
  switch (type) {
    case 'CSO': {
      const result = await withDbRetry(userId, () => getCsoSales(code, period), 'CSO 조회');
      if (result) {
        const carousel = createCsoCarousel(result);
        await sendFlexMessage(userId, carousel, `[${result.cso.cso_dealer_nm}] CSO 조회`);
      }
      break;
    }

    case 'HOSPITAL': {
      const [hos_cd, hos_cso_cd] = code.split('|');

      // Phase 1: 요약 + 블록 먼저 전송 (빠른 첫 응답)
      const summaryResult = await withDbRetry(userId, () => getHospitalSummary(hos_cd, hos_cso_cd, period), '병원 요약 조회');
      if (summaryResult) {
        const hospitalName = summaryResult.hospital.hos_abbr || summaryResult.hospital.hos_name;
        const summaryCarousel = await createSummaryCarousel(summaryResult, {
          isSuperAdmin,
          userId,
        });
        await sendFlexMessage(userId, summaryCarousel, `[${hospitalName}] 병원 조회`);

        // Phase 2: 품목 + CSO 상세 전송
        const detailResult = await withDbRetry(
          userId,
          () => getHospitalDetails(
            hos_cd,
            hos_cso_cd,
            summaryResult.startIndex,
            summaryResult.endIndex,
            summaryResult.periodText
          ),
          '병원 상세 조회'
        );
        if (detailResult) {
          const detailCarousels = createDetailCarousel(detailResult);
          for (const carousel of detailCarousels) {
            await sendFlexMessage(userId, carousel, `[${hospitalName}] 상세 조회`);
          }
        }
      }
      break;
    }

    case 'DRUG': {
      const result = await withDbRetry(userId, () => getDrugSales(code, period), '품목 조회');
      if (result) {
        const carousel = createDrugCarousel(result, isAdmin);
        await sendFlexMessage(userId, carousel, `[${result.drug.drug_name}] 품목 조회`);
      }
      break;
    }

    default:
      logger.warn(`Unknown Depth2 type: ${type}`);
      await sendTextMessage(userId, '알 수 없는 조회 타입입니다.');
  }
}

/**
 * Depth3 복합 엔티티 조회 (확장: 네비게이션 버튼 + 세번째 차원 요약)
 */
async function handleDepth3(
  userId: string,
  type: string,
  code: string,
  period: any
): Promise<void> {
  // parseDepth3Code 헬퍼를 사용하여 코드 파싱
  const entityType = type as Depth3EntityType;
  const parsed = parseDepth3Code(entityType, code);

  switch (type) {
    case 'CSO|HOSPITAL': {
      // code: cso_cd||hos_cd|hos_cso_cd
      const cso_cd = parsed.first;
      const hos_cd = parsed.secondHosCd!;
      const hos_cso_cd = parsed.secondHosCsoCd!;
      const result = await withDbRetry(
        userId,
        () => getCsoHospitalSalesExtended(cso_cd, hos_cd, hos_cso_cd, period),
        'CSO-병원 조회'
      );
      if (result) {
        const carousel = createCompositeCarousel(result);
        await sendFlexMessage(userId, carousel, result.title);
      }
      break;
    }

    case 'CSO|DRUG': {
      // code: cso_cd||drug_cd
      const cso_cd = parsed.first;
      const drug_cd = parsed.second;
      const result = await withDbRetry(
        userId,
        () => getCsoDrugSalesExtended(cso_cd, drug_cd, period),
        'CSO-품목 조회'
      );
      if (result) {
        const carousel = createCompositeCarousel(result);
        await sendFlexMessage(userId, carousel, result.title);
      }
      break;
    }

    case 'HOSPITAL|DRUG': {
      // code: hos_cd|hos_cso_cd||drug_cd
      const hos_cd = parsed.firstHosCd!;
      const hos_cso_cd = parsed.firstHosCsoCd!;
      const drug_cd = parsed.second;
      const result = await withDbRetry(
        userId,
        () => getHospitalDrugSalesExtended(hos_cd, hos_cso_cd, drug_cd, period),
        '병원-품목 조회'
      );
      if (result) {
        const carousel = createCompositeCarousel(result);
        await sendFlexMessage(userId, carousel, result.title);
      }
      break;
    }

    case 'HOSPITAL|CSO': {
      // code: hos_cd|hos_cso_cd||cso_cd
      const hos_cd = parsed.firstHosCd!;
      const hos_cso_cd = parsed.firstHosCsoCd!;
      const cso_cd = parsed.second;
      const result = await withDbRetry(
        userId,
        () => getHospitalCsoSalesExtended(hos_cd, hos_cso_cd, cso_cd, period),
        '병원-CSO 조회'
      );
      if (result) {
        const carousel = createCompositeCarousel(result);
        await sendFlexMessage(userId, carousel, result.title);
      }
      break;
    }

    case 'DRUG|HOSPITAL': {
      // code: drug_cd||hos_cd|hos_cso_cd
      const drug_cd = parsed.first;
      const hos_cd = parsed.secondHosCd!;
      const hos_cso_cd = parsed.secondHosCsoCd!;
      const result = await withDbRetry(
        userId,
        () => getDrugHospitalSalesExtended(drug_cd, hos_cd, hos_cso_cd, period),
        '품목-병원 조회'
      );
      if (result) {
        const carousel = createCompositeCarousel(result);
        await sendFlexMessage(userId, carousel, result.title);
      }
      break;
    }

    case 'DRUG|CSO': {
      // code: drug_cd||cso_cd
      const drug_cd = parsed.first;
      const cso_cd = parsed.second;
      const result = await withDbRetry(
        userId,
        () => getDrugCsoSalesExtended(drug_cd, cso_cd, period),
        '품목-CSO 조회'
      );
      if (result) {
        const carousel = createCompositeCarousel(result);
        await sendFlexMessage(userId, carousel, result.title);
      }
      break;
    }

    default:
      logger.warn(`Unknown Depth3 type: ${type}`);
      await sendTextMessage(userId, '알 수 없는 조회 타입입니다.');
  }
}

/**
 * 기존 형식 postback 처리 (하위 호환)
 */
async function handleLegacyPostback(userId: string, data: any): Promise<void> {
  const { action, type, value, context } = data;

  // search_select 처리 (검색 결과 선택)
  if (action === 'search_select') {
    const period = await getCurrentPeriod(3);

    // 권한 조회 (drug, hospital 타입에서 필요)
    const permission = await getUserPermission(userId);
    const isAdmin = permission?.role === UserRole.ADMIN || permission?.role === UserRole.SUPER_ADMIN;
    const isSuperAdmin = permission?.role === UserRole.SUPER_ADMIN;

    switch (type) {
      case 'cso':
        await handleDepth2(userId, 'CSO', value, period);
        break;
      case 'hospital':
        await handleDepth2(userId, 'HOSPITAL', value, period, false, isSuperAdmin);
        break;
      case 'drug':
        await handleDepth2(userId, 'DRUG', value, period, isAdmin);
        break;
      default:
        await sendTextMessage(userId, `알 수 없는 검색 타입: ${type}`);
    }
    return;
  }

  // Category 처리 (이전 형식)
  if (data.Category) {
    await sendTextMessage(userId, `${data.Category} 카테고리 조회 기능이 업데이트되었습니다. 다시 검색해주세요.`);
    return;
  }

  // 기타 action 처리
  if (action) {
    logger.info(`Legacy action: ${action}, context: ${JSON.stringify(context)}`);
    await sendTextMessage(userId, `${action} 기능은 준비 중입니다.`);
    return;
  }

  logger.warn(`Unknown legacy postback format: ${JSON.stringify(data)}`);
  await sendTextMessage(userId, '알 수 없는 요청입니다.');
}
