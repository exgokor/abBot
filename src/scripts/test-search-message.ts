/**
 * 검색 결과 메시지 테스트 스크립트
 */

import { searchAll, createSearchResultCarousel, getCategoryTrend } from '../services/sales/searchService';
import { sendFlexMessage } from '../services/naverworks/message';

const TEST_USER_ID = '73524122-e756-4c53-179e-0378b4ad90b5';

async function main() {
  const keyword = process.argv[2] || '울산';

  console.log(`검색어: "${keyword}"`);
  console.log('검색 중...');

  try {
    // 검색 실행
    const searchResult = await searchAll(keyword);

    console.log('\n검색 결과:');
    console.log(`- 지역: ${searchResult.regionTotalCount}건 (overflow: ${searchResult.regionOverflow})`);
    console.log(`- 병원: ${searchResult.hospitalTotalCount}건 (overflow: ${searchResult.hospitalOverflow})`);
    console.log(`- 약품: ${searchResult.drugTotalCount}건 (overflow: ${searchResult.drugOverflow})`);
    console.log(`- CSO: ${searchResult.csoTotalCount}건 (overflow: ${searchResult.csoOverflow})`);

    // 트렌드 데이터 조회 (검색 결과가 있는 모든 카테고리)
    const trendData: any = {};

    if (searchResult.regionTotalCount > 0) {
      console.log('\n지역 트렌드 조회 중...');
      trendData.region = await getCategoryTrend('region', keyword, searchResult);
    }
    if (searchResult.hospitalTotalCount > 0) {
      console.log('병원 트렌드 조회 중...');
      trendData.hospital = await getCategoryTrend('hospital', keyword, searchResult);
    }
    if (searchResult.drugTotalCount > 0) {
      console.log('약품 트렌드 조회 중...');
      trendData.drug = await getCategoryTrend('drug', keyword, searchResult);
    }
    if (searchResult.csoTotalCount > 0) {
      console.log('CSO 트렌드 조회 중...');
      trendData.cso = await getCategoryTrend('cso', keyword, searchResult);
    }

    // 캐러셀 생성
    const carousel = createSearchResultCarousel(keyword, searchResult, trendData);

    console.log('\n캐러셀 버블 수:', carousel.contents.length);
    console.log('메시지 발송 중...');

    // 메시지 발송
    await sendFlexMessage(TEST_USER_ID, carousel);

    console.log('\n✓ 메시지 발송 완료!');

  } catch (error) {
    console.error('오류 발생:', error);
  }

  process.exit(0);
}

main();
