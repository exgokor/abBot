import { PostbackRequest } from './index';
import { logger } from '../utils/logger';
import { sendTextMessage, sendFlexMessage } from '../services/naverworks/message';
import { getCsoSales, createCsoCarousel } from '../services/sales/csoSales';
import {
  getHospitalSales,
  createHospitalCarousel
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
import { getUserPermission, getUserAllowedEntities, UserRole } from '../middleware/permission';

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

  // 권한 조회
  const permission = await getUserPermission(userId);
  const isAdmin = permission?.role === UserRole.ADMIN || permission?.role === UserRole.SUPER_ADMIN;
  const isSuperAdmin = permission?.role === UserRole.SUPER_ADMIN;
  const isUser = permission?.role === UserRole.USER;

  // USER일 경우 접근 제어를 위해 허용 엔티티 조회
  let userCsoCodes: string[] | undefined;
  if (isUser) {
    const entities = await getUserAllowedEntities(userId);
    if (entities) {
      userCsoCodes = entities.csoCodes;

      // CSO/HOSPITAL 접근 제어
      if (depth === 2) {
        if (type === 'CSO' && !entities.csoCodes.includes(code)) {
          await sendTextMessage(userId, '조회 권한이 없습니다.');
          return;
        }
        if (type === 'HOSPITAL' && !entities.hospitalKeys.includes(code)) {
          await sendTextMessage(userId, '조회 권한이 없습니다.');
          return;
        }
      } else if (depth === 3) {
        // Depth3: 타입에 CSO나 HOSPITAL이 포함되면 접근 제어
        const parsed = parseDepth3Code(type as Depth3EntityType, code);
        if (type.includes('CSO')) {
          const csoCd = type.startsWith('CSO') ? parsed.first : parsed.second;
          if (!entities.csoCodes.includes(csoCd)) {
            await sendTextMessage(userId, '조회 권한이 없습니다.');
            return;
          }
        }
        if (type.includes('HOSPITAL')) {
          const hosKey = type.startsWith('HOSPITAL')
            ? `${parsed.firstHosCd}|${parsed.firstHosCsoCd}`
            : `${parsed.secondHosCd}|${parsed.secondHosCsoCd}`;
          if (!entities.hospitalKeys.includes(hosKey)) {
            await sendTextMessage(userId, '조회 권한이 없습니다.');
            return;
          }
        }
      }
    }
  }

  if (depth === 2) {
    await handleDepth2(userId, type, code, period, isAdmin, isSuperAdmin, userCsoCodes);
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
 * @param userCsoCodes USER일 경우 본인 CSO 코드 목록 (DRUG 조회 시 필터링용)
 */
export async function handleDepth2(
  userId: string,
  type: string,
  code: string,
  period: any,
  isAdmin: boolean = false,
  isSuperAdmin: boolean = false,
  userCsoCodes?: string[]
): Promise<void> {
  switch (type) {
    case 'CSO': {
      const tDb = Date.now();
      const result = await withDbRetry(userId, () => getCsoSales(code, period), 'CSO 조회');
      logger.info(`[PERF] CSO DB조회: ${Date.now() - tDb}ms`);
      if (result) {
        // 중간 메시지: 데이터 조회 완료, 집계 중
        await sendTextMessage(userId, `매출 데이터 조회 완료, 집계 중...`);
        const carousel = createCsoCarousel(result);
        const tFlex = Date.now();
        await sendFlexMessage(userId, carousel, `[${result.cso.cso_dealer_nm}] CSO 조회`);
        logger.info(`[PERF] CSO Flex전송: ${Date.now() - tFlex}ms`);
      }
      break;
    }

    case 'HOSPITAL': {
      const [hos_cd, hos_cso_cd] = code.split('|');

      // 모든 데이터 한번에 조회 (7개 쿼리 병렬 실행)
      const tDb = Date.now();
      const result = await withDbRetry(userId, () => getHospitalSales(hos_cd, hos_cso_cd, period), '병원 조회');
      logger.info(`[PERF] 병원DB조회: ${Date.now() - tDb}ms`);
      if (result) {
        const hospitalName = result.hospital.hos_abbr || result.hospital.hos_name;

        // 중간 메시지: 데이터 조회 완료, 집계 중
        const tMsg1 = Date.now();
        await sendTextMessage(userId, `매출 데이터 조회 완료, 집계 중...`);
        logger.info(`[PERF] 중간메시지전송: ${Date.now() - tMsg1}ms`);

        // 통합 캐러셀 생성 및 전송
        const tCarousel = Date.now();
        const carousels = await createHospitalCarousel(result, {
          isSuperAdmin,
          userId,
        });
        logger.info(`[PERF] 캐러셀생성: ${Date.now() - tCarousel}ms (${carousels.length}개)`);
        for (let i = 0; i < carousels.length; i++) {
          const tFlex = Date.now();
          await sendFlexMessage(userId, carousels[i], `[${hospitalName}] 병원 조회`);
          logger.info(`[PERF] Flex전송[${i}]: ${Date.now() - tFlex}ms`);
        }
      }
      break;
    }

    case 'DRUG': {
      const tDb = Date.now();
      const result = await withDbRetry(userId, () => getDrugSales(code, period, userCsoCodes), '품목 조회');
      logger.info(`[PERF] DRUG DB조회: ${Date.now() - tDb}ms`);
      if (result) {
        // 중간 메시지: 데이터 조회 완료, 집계 중
        await sendTextMessage(userId, `매출 데이터 조회 완료, 집계 중...`);
        const carousel = createDrugCarousel(result, isAdmin);
        const tFlex = Date.now();
        await sendFlexMessage(userId, carousel, `[${result.drug.drug_name}] 품목 조회`);
        logger.info(`[PERF] DRUG Flex전송: ${Date.now() - tFlex}ms`);
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

    // 권한 조회
    const permission = await getUserPermission(userId);
    const isAdmin = permission?.role === UserRole.ADMIN || permission?.role === UserRole.SUPER_ADMIN;
    const isSuperAdmin = permission?.role === UserRole.SUPER_ADMIN;
    const isUser = permission?.role === UserRole.USER;

    // USER일 경우 접근 제어
    let userCsoCodes: string[] | undefined;
    if (isUser) {
      const entities = await getUserAllowedEntities(userId);
      if (entities) {
        userCsoCodes = entities.csoCodes;
        if (type === 'cso' && !entities.csoCodes.includes(value)) {
          await sendTextMessage(userId, '조회 권한이 없습니다.');
          return;
        }
        if (type === 'hospital' && !entities.hospitalKeys.includes(value)) {
          await sendTextMessage(userId, '조회 권한이 없습니다.');
          return;
        }
      }
    }

    switch (type) {
      case 'cso':
        await handleDepth2(userId, 'CSO', value, period, false, false, userCsoCodes);
        break;
      case 'hospital':
        await handleDepth2(userId, 'HOSPITAL', value, period, false, isSuperAdmin, userCsoCodes);
        break;
      case 'drug':
        await handleDepth2(userId, 'DRUG', value, period, isAdmin, false, userCsoCodes);
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
