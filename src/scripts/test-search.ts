/**
 * 검색 테스트 스크립트
 * 사용법: npx ts-node src/scripts/test-search.ts
 */

import { searchAll, createSearchResultCarousel } from '../services/sales/searchService';
import { getCurrentPeriod } from '../services/sales/periodService';

async function testSearch() {
  const keyword = '크레트롤';

  console.log(`\n========== "${keyword}" 검색 테스트 ==========\n`);

  try {
    // 1. 검색 실행
    const searchResult = await searchAll(keyword);

    console.log('=== 검색 결과 ===');
    console.log(`총 ${searchResult.totalCount}건`);
    console.log(`- CSO: ${searchResult.csoCount}건`);
    console.log(`- 병원: ${searchResult.hospitalCount}건`);
    console.log(`- 품목: ${searchResult.drugCount}건`);

    console.log('\n=== CSO 목록 ===');
    searchResult.csos.forEach((cso, i) => {
      console.log(`${i + 1}. ${cso.search_name} (${cso.entity_cd})`);
    });

    console.log('\n=== 병원 목록 ===');
    searchResult.hospitals.forEach((h, i) => {
      console.log(`${i + 1}. ${h.search_name} (${h.entity_cd})`);
    });

    console.log('\n=== 품목 목록 ===');
    searchResult.drugs.forEach((d, i) => {
      console.log(`${i + 1}. ${d.search_name} (${d.entity_cd})`);
    });

    // 2. 캐러셀 생성
    if (searchResult.totalCount > 0 && searchResult.totalCount <= 20) {
      const period = await getCurrentPeriod(3);
      const carousel = createSearchResultCarousel(keyword, searchResult, period.periodText);

      console.log('\n=== 생성된 캐러셀 ===');
      console.log(JSON.stringify(carousel, null, 2));
    }

  } catch (error) {
    console.error('검색 실패:', error);
  }

  process.exit(0);
}

testSearch();
