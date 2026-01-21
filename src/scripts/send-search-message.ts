/**
 * 검색 결과 메시지 전송 테스트
 * 사용법: npx ts-node src/scripts/send-search-message.ts "충남"
 */

import { sendFlexMessage, sendTextMessage } from '../services/naverworks/message';
import { searchAll, createSearchResultCarousel, getTotalCount, isSingleResult } from '../services/sales/searchService';
import { getRegionSales, createRegionCarousel } from '../services/sales/regionSales';
import { getHospitalSales, createHospitalCarousel } from '../services/sales/hospitalSales';
import { getDrugSales, createDrugCarousel } from '../services/sales/drugSales';
import { getConnection } from '../services/database/connection';

const TEST_USER_ID = '73524122-e756-4c53-179e-0378b4ad90b5';

async function main() {
  const keyword = process.argv[2] || '충남';

  console.log(`\n========== "${keyword}" 검색 → NaverWorks 전송 ==========\n`);

  try {
    const result = await searchAll(keyword);
    const totalCount = getTotalCount(result);

    console.log(`검색 결과: ${totalCount}건`);

    if (totalCount === 0) {
      await sendTextMessage(TEST_USER_ID, `[${keyword}] 검색 결과가 없습니다.`);
      console.log('결과 없음 메시지 전송 완료');
      return;
    }

    // 단일 결과 → 바로 상세 조회
    if (isSingleResult(result)) {
      console.log('단일 결과 → 상세 조회');
      if (result.regions.length === 1) {
        const regionResult = await getRegionSales(result.regions[0].hosIndex);
        if (regionResult) {
          const carousel = createRegionCarousel(result.regions[0].hosIndex, regionResult);
          await sendFlexMessage(TEST_USER_ID, carousel);
        }
      } else if (result.hospitals.length === 1) {
        const h = result.hospitals[0];
        const hospitalResult = await getHospitalSales(h.hos_cd, h.hos_cso_cd);
        if (hospitalResult) {
          const carousel = createHospitalCarousel(hospitalResult);
          await sendFlexMessage(TEST_USER_ID, carousel);
        }
      } else if (result.drugs.length === 1) {
        const drugResult = await getDrugSales(result.drugs[0].drug_cd);
        if (drugResult) {
          const carousel = createDrugCarousel(drugResult);
          await sendFlexMessage(TEST_USER_ID, carousel);
        }
      }
      console.log('상세 조회 메시지 전송 완료');
      return;
    }

    // 복수 결과 → 선택 캐러셀
    console.log('복수 결과 → 선택 캐러셀');
    const carousel = createSearchResultCarousel(keyword, result);
    await sendFlexMessage(TEST_USER_ID, carousel);
    console.log('선택 캐러셀 전송 완료!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    const pool = await getConnection();
    await pool.close();
    process.exit(0);
  }
}

main();
