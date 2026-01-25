import { PostbackRequest } from './index';
import { logger } from '../utils/logger';
import { sendTextMessage, sendFlexMessage, createTextBubble } from '../services/naverworks/message';
import { getRegionSales, createRegionCarousel, createRegionPeriodCarousel } from '../services/sales/regionSales';
import { getHospitalSales, createHospitalCarousel, createHospitalPeriodCarousel } from '../services/sales/hospitalSales';
import { getDrugSales, createDrugCarousel } from '../services/sales/drugSales';
import { getCsoSales, createCsoCarousel, createCsoPeriodCarousel } from '../services/sales/csoSales';
import { withDbRetry } from '../utils/dbErrorHandler';

/**
 * Postback 데이터 타입 (버튼 클릭 시 전달되는 데이터)
 */
interface PostbackData {
  Category?: string;
  Code?: string;
  Name?: string;
  action?: string;
  [key: string]: any;
}

/**
 * Postback 메시지 처리
 */
export async function handlePostback(request: PostbackRequest): Promise<void> {
  const userId = request.source.userId;
  const rawData = request.data;

  logger.info(`Postback from ${userId}: ${rawData}`);

  let data: PostbackData;
  try {
    data = JSON.parse(rawData);
  } catch {
    logger.error(`Failed to parse postback data: ${rawData}`);
    await sendTextMessage(userId, '요청 처리 중 오류가 발생했습니다.');
    return;
  }

  // Category 기반 라우팅
  if (data.Category) {
    await handleCategoryAction(userId, data);
    return;
  }

  // action 기반 라우팅
  if (data.action) {
    await handleAction(userId, data);
    return;
  }

  // 기본 처리
  logger.warn(`Unknown postback format: ${rawData}`);
  await sendTextMessage(userId, '알 수 없는 요청입니다.');
}

/**
 * 카테고리 기반 액션 처리
 */
async function handleCategoryAction(userId: string, data: PostbackData): Promise<void> {
  const { Category, Code, Name } = data;

  logger.info(`Category action: ${Category}, Code: ${Code}, Name: ${Name}`);

  switch (Category) {
    case '병원':
      await handleHospitalAction(userId, Code, Name);
      break;

    default:
      await sendTextMessage(userId, `${Category} 카테고리 처리 준비 중입니다.`);
  }
}

/**
 * 액션 기반 처리
 */
async function handleAction(userId: string, data: PostbackData): Promise<void> {
  const { action } = data;

  logger.info(`Action: ${action}`);

  switch (action) {
    case 'confirm':
      await sendTextMessage(userId, '확인되었습니다.');
      break;

    case 'cancel':
      await sendTextMessage(userId, '취소되었습니다.');
      break;

    case 'search_select':
      await handleSearchSelect(userId, data);
      break;

    case 'hospital_period':
      await handleHospitalPeriod(userId, data);
      break;

    case 'cso_period':
      await handleCsoPeriod(userId, data);
      break;

    case 'change_period':
      await handleChangePeriod(userId, data);
      break;

    case 'drill_down':
      await handleDrillDown(userId, data);
      break;

    default:
      await sendTextMessage(userId, `알 수 없는 액션: ${action}`);
  }
}

/**
 * 검색 결과 선택 처리
 */
async function handleSearchSelect(userId: string, data: PostbackData): Promise<void> {
  const { type, value } = data;

  logger.info(`Search select: type=${type}, value=${value}`);

  switch (type) {
    case 'region': {
      await sendTextMessage(userId, `[지역 - ${value}] 검색합니다.`);
      const regionResult = await withDbRetry(userId, () => getRegionSales(value), '지역 조회');
      if (regionResult) {
        const regionCarousel = createRegionCarousel(value, regionResult);
        await sendFlexMessage(userId, regionCarousel, `[${value}] 분석 완료`);
      }
      break;
    }

    case 'hospital': {
      const [hos_cd, hos_cso_cd] = value.split('|');
      const hospitalResult = await withDbRetry(userId, () => getHospitalSales(hos_cd, hos_cso_cd), '병원 조회');
      if (hospitalResult) {
        const hospitalName = hospitalResult.hospital.hos_abbr || hospitalResult.hospital.hos_name;
        await sendTextMessage(userId, `[병원 - ${hospitalName}] 검색합니다.`);
        const hospitalCarousel = createHospitalCarousel(hospitalResult);
        await sendFlexMessage(userId, hospitalCarousel, `[${hospitalName}] 분석 완료`);
      }
      break;
    }

    case 'drug': {
      const drugResult = await withDbRetry(userId, () => getDrugSales(value), '약품 조회');
      if (drugResult) {
        const drugName = drugResult.drug.drug_name;
        await sendTextMessage(userId, `[약품 - ${drugName}] 검색합니다.`);
        const drugCarousel = createDrugCarousel(drugResult);
        await sendFlexMessage(userId, drugCarousel, `[${drugName}] 분석 완료`);
      }
      break;
    }

    case 'cso': {
      const csoResult = await withDbRetry(userId, () => getCsoSales(value), 'CSO 조회');
      if (csoResult) {
        const csoName = csoResult.cso.cso_dealer_nm;
        await sendTextMessage(userId, `[CSO - ${csoName}] 검색합니다.`);
        const csoCarousel = createCsoCarousel(csoResult);
        await sendFlexMessage(userId, csoCarousel, `[${csoName}] 분석 완료`);
      }
      break;
    }

    default:
      await sendTextMessage(userId, `알 수 없는 검색 타입: ${type}`);
  }
}

/**
 * 병원 관련 액션 처리
 */
async function handleHospitalAction(userId: string, code?: string, name?: string): Promise<void> {
  // TODO: DB에서 병원 정보 조회
  const flexMessage = createTextBubble(
    `병원 정보`,
    `병원명: ${name || '알 수 없음'}\n코드: ${code || '없음'}\n\n상세 정보는 준비 중입니다.`
  );

  await sendFlexMessage(userId, flexMessage, '병원 정보');
}

/**
 * 병원 기간 변경 처리 (6개월/1년/3개월)
 */
async function handleHospitalPeriod(userId: string, data: PostbackData): Promise<void> {
  const { period_months, context } = data;
  const { hos_cd, hos_cso_cd } = context || {};

  if (!hos_cd || !hos_cso_cd) {
    await sendTextMessage(userId, '병원 정보가 누락되었습니다.');
    return;
  }

  logger.info(`Hospital period change: ${period_months}개월, hos_cd=${hos_cd}, hos_cso_cd=${hos_cso_cd}`);

  const result = await withDbRetry(userId, () => getHospitalSales(hos_cd, hos_cso_cd, period_months), '병원 조회');
  if (!result) return;

  const hospitalName = result.hospital.hos_abbr || result.hospital.hos_name;
  const carousel = period_months === 3
    ? createHospitalCarousel(result)
    : createHospitalPeriodCarousel(result);

  await sendFlexMessage(userId, carousel, `[${hospitalName}] ${period_months}개월 분석`);
}

/**
 * CSO 기간 변경 처리 (6개월/1년/3개월)
 */
async function handleCsoPeriod(userId: string, data: PostbackData): Promise<void> {
  const { period_months, context } = data;
  const { cso_cd } = context || {};

  if (!cso_cd) {
    await sendTextMessage(userId, 'CSO 정보가 누락되었습니다.');
    return;
  }

  logger.info(`CSO period change: ${period_months}개월, cso_cd=${cso_cd}`);

  const result = await withDbRetry(userId, () => getCsoSales(cso_cd, period_months), 'CSO 조회');
  if (!result) return;

  const csoName = result.cso.cso_dealer_nm;
  const carousel = period_months === 3
    ? createCsoCarousel(result)
    : createCsoPeriodCarousel(result);

  await sendFlexMessage(userId, carousel, `[${csoName}] ${period_months}개월 분석`);
}

/**
 * 지역 기간 변경 처리 (6개월/1년/3개월)
 */
async function handleChangePeriod(userId: string, data: PostbackData): Promise<void> {
  const { period_months, context } = data;
  const { region } = context || {};

  if (!region) {
    await sendTextMessage(userId, '지역 정보가 누락되었습니다.');
    return;
  }

  logger.info(`Region period change: ${period_months}개월, region=${region}`);

  const result = await withDbRetry(userId, () => getRegionSales(region, period_months), '지역 조회');
  if (!result) return;

  const carousel = period_months === 3
    ? createRegionCarousel(region, result)
    : createRegionPeriodCarousel(region, result);

  await sendFlexMessage(userId, carousel, `[${region}] ${period_months}개월 분석`);
}

/**
 * Drill-down 처리 (TOP5 병원, TOP5 품목, 병원 상세)
 */
async function handleDrillDown(userId: string, data: PostbackData): Promise<void> {
  const { type, context } = data;

  logger.info(`Drill down: type=${type}, context=${JSON.stringify(context)}`);

  switch (type) {
    case 'hospital_detail': {
      const { hos_cd, hos_cso_cd, period_months = 3 } = context || {};
      if (!hos_cd || !hos_cso_cd) {
        await sendTextMessage(userId, '병원 정보가 누락되었습니다.');
        return;
      }

      const hospitalResult = await withDbRetry(userId, () => getHospitalSales(hos_cd, hos_cso_cd, period_months), '병원 조회');
      if (hospitalResult) {
        const hospitalName = hospitalResult.hospital.hos_abbr || hospitalResult.hospital.hos_name;
        const carousel = createHospitalCarousel(hospitalResult);
        await sendFlexMessage(userId, carousel, `[${hospitalName}] 분석 완료`);
      }
      break;
    }

    case 'top_hospitals':
      await sendTextMessage(userId, 'TOP5 병원 상세 기능은 준비 중입니다.');
      break;

    case 'top_drugs':
      await sendTextMessage(userId, 'TOP5 품목 상세 기능은 준비 중입니다.');
      break;

    default:
      await sendTextMessage(userId, `알 수 없는 drill-down 타입: ${type}`);
  }
}
