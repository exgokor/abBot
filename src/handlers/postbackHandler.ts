import { PostbackRequest } from './index';
import { logger } from '../utils/logger';
import { sendTextMessage, sendFlexMessage, createTextBubble } from '../services/naverworks/message';
import { getRegionSales, createRegionCarousel } from '../services/sales/regionSales';
import { getHospitalSales, createHospitalCarousel } from '../services/sales/hospitalSales';
import { getDrugSales, createDrugCarousel } from '../services/sales/drugSales';

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

  try {
    switch (type) {
      case 'region':
        // 지역 상세 조회
        const regionResult = await getRegionSales(value);
        if (regionResult) {
          const regionCarousel = createRegionCarousel(value, regionResult);
          await sendFlexMessage(userId, regionCarousel);
        } else {
          await sendTextMessage(userId, `'${value}' 지역의 매출 데이터가 없습니다.`);
        }
        break;

      case 'hospital':
        // 병원 상세 조회 (hos_cd|hos_cso_cd 파싱)
        const [hos_cd, hos_cso_cd] = value.split('|');
        const hospitalResult = await getHospitalSales(hos_cd, hos_cso_cd);
        if (hospitalResult) {
          const hospitalCarousel = createHospitalCarousel(hospitalResult);
          await sendFlexMessage(userId, hospitalCarousel);
        } else {
          await sendTextMessage(userId, '해당 병원의 매출 데이터가 없습니다.');
        }
        break;

      case 'drug':
        // 약품 상세 조회
        const drugResult = await getDrugSales(value);
        if (drugResult) {
          const drugCarousel = createDrugCarousel(drugResult);
          await sendFlexMessage(userId, drugCarousel);
        } else {
          await sendTextMessage(userId, '해당 약품의 매출 데이터가 없습니다.');
        }
        break;

      default:
        await sendTextMessage(userId, `알 수 없는 검색 타입: ${type}`);
    }
  } catch (error) {
    logger.error(`Search select error:`, error);
    await sendTextMessage(userId, '조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
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

  await sendFlexMessage(userId, flexMessage);
}
