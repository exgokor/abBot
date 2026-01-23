/**
 * 테스트 메시지 발송 스크립트
 *
 * 사용법: npx ts-node src/scripts/testSendMessage.ts
 */

import { sendTextMessage, sendFlexMessage } from '../services/naverworks/message';
import { searchAll, getTotalCount, isSingleResult, createSearchResultCarousel, getCategoryTrend } from '../services/sales/searchService';
import { getHospitalSales, createHospitalCarousel, createHospitalPeriodCarousel } from '../services/sales/hospitalSales';
import { getRegionSales, createRegionCarousel, createRegionPeriodCarousel } from '../services/sales/regionSales';
import { getCsoSales, createCsoCarousel, createCsoPeriodCarousel } from '../services/sales/csoSales';

// 테스트 대상 userId (CLAUDE.md에서 지정)
const TEST_USER_ID = '73524122-e756-4c53-179e-0378b4ad90b5';

async function main() {
  const args = process.argv.slice(2);
  const testType = args[0] || 'all';

  console.log(`\n=== 테스트 메시지 발송 시작 (type: ${testType}) ===\n`);

  try {
    switch (testType) {
      case 'hospital':
        await testHospitalSearch();
        break;
      case 'region':
        await testRegionSearch();
        break;
      case 'cso':
        await testCsoSearch();
        break;
      case 'period':
        await testPeriodChange();
        break;
      case 'all':
      default:
        await testHospitalSearch();
        await sleep(2000);
        await testRegionSearch();
        await sleep(2000);
        await testCsoSearch();
        break;
    }

    console.log('\n=== 테스트 완료 ===\n');
  } catch (error) {
    console.error('테스트 실패:', error);
  }

  process.exit(0);
}

/**
 * 병원 검색 테스트 (부천성모)
 */
async function testHospitalSearch() {
  console.log('1. 병원 검색 테스트: "부천성모"');

  // 검색 실행
  const searchResult = await searchAll('부천성모');
  const totalCount = getTotalCount(searchResult);

  console.log(`   - 검색 결과: 지역 ${searchResult.regionTotalCount}건, 병원 ${searchResult.hospitalTotalCount}건, 약품 ${searchResult.drugTotalCount}건, CSO ${searchResult.csoTotalCount}건`);

  if (totalCount === 0) {
    await sendTextMessage(TEST_USER_ID, '[부천성모] 검색 결과가 없습니다.');
    return;
  }

  // 단일 결과면 바로 상세 조회
  if (isSingleResult(searchResult)) {
    if (searchResult.hospitals.length === 1) {
      const h = searchResult.hospitals[0];
      console.log(`   - 단일 병원 결과: ${h.hos_name}`);

      const hospitalResult = await getHospitalSales(h.hos_cd, h.hos_cso_cd);
      if (hospitalResult) {
        const carousel = createHospitalCarousel(hospitalResult);
        await sendFlexMessage(TEST_USER_ID, carousel, `[${hospitalResult.hospital.hos_abbr || hospitalResult.hospital.hos_name}] 분석 완료`);
        console.log('   - 병원 상세 캐러셀 전송 완료');
      }
    }
    return;
  }

  // 복수 결과면 선택 캐러셀
  const trendData: any = {};
  if (searchResult.hospitalTotalCount > 0) {
    trendData.hospital = await getCategoryTrend('hospital', '부천성모', searchResult);
  }

  const carousel = createSearchResultCarousel('부천성모', searchResult, trendData);
  await sendFlexMessage(TEST_USER_ID, carousel, '[부천성모] 검색 결과');
  console.log('   - 검색 결과 캐러셀 전송 완료');
}

/**
 * 지역 검색 테스트 (서울)
 */
async function testRegionSearch() {
  console.log('2. 지역 검색 테스트: "서울"');

  const result = await getRegionSales('서울', 3);

  if (!result) {
    await sendTextMessage(TEST_USER_ID, '[서울] 지역의 매출 데이터가 없습니다.');
    return;
  }

  console.log(`   - 지역 결과: 병원 ${result.summary.hospital_count}개, 품목 ${result.summary.drug_count}개`);

  const carousel = createRegionCarousel('서울', result);
  await sendFlexMessage(TEST_USER_ID, carousel, '[서울] 분석 완료');
  console.log('   - 지역 상세 캐러셀 전송 완료');
}

/**
 * CSO 검색 테스트
 */
async function testCsoSearch() {
  console.log('3. CSO 검색 테스트');

  // CSO 검색
  const searchResult = await searchAll('김');

  if (searchResult.csoTotalCount === 0) {
    console.log('   - CSO 검색 결과 없음, 스킵');
    return;
  }

  // 첫 번째 CSO로 테스트
  const cso = searchResult.csos[0];
  console.log(`   - CSO: ${cso.cso_dealer_nm}`);

  const result = await getCsoSales(cso.cso_cd);

  if (!result) {
    await sendTextMessage(TEST_USER_ID, `[${cso.cso_dealer_nm}] CSO의 매출 데이터가 없습니다.`);
    return;
  }

  const carousel = createCsoCarousel(result);
  await sendFlexMessage(TEST_USER_ID, carousel, `[${cso.cso_dealer_nm}] 분석 완료`);
  console.log('   - CSO 상세 캐러셀 전송 완료');
}

/**
 * 기간 변경 테스트 (6개월, 1년)
 */
async function testPeriodChange() {
  console.log('4. 기간 변경 테스트 (부천성모 6개월/1년)');

  // 먼저 병원 찾기
  const searchResult = await searchAll('부천성모');
  if (searchResult.hospitals.length === 0) {
    console.log('   - 병원 검색 결과 없음');
    return;
  }

  const h = searchResult.hospitals[0];

  // 6개월 데이터
  console.log('   - 6개월 데이터 조회 중...');
  const result6 = await getHospitalSales(h.hos_cd, h.hos_cso_cd, 6);
  if (result6) {
    const carousel6 = createHospitalPeriodCarousel(result6);
    await sendFlexMessage(TEST_USER_ID, carousel6, `[${result6.hospital.hos_abbr || result6.hospital.hos_name}] 6개월 분석`);
    console.log('   - 6개월 캐러셀 전송 완료');
  }

  await sleep(2000);

  // 1년 데이터
  console.log('   - 1년 데이터 조회 중...');
  const result12 = await getHospitalSales(h.hos_cd, h.hos_cso_cd, 12);
  if (result12) {
    const carousel12 = createHospitalPeriodCarousel(result12);
    await sendFlexMessage(TEST_USER_ID, carousel12, `[${result12.hospital.hos_abbr || result12.hospital.hos_name}] 1년 분석`);
    console.log('   - 1년 캐러셀 전송 완료');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
