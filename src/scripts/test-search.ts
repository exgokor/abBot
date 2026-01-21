/**
 * 통합 검색 테스트 스크립트
 * 사용법: npx ts-node src/scripts/test-search.ts "충남"
 */

import { searchAll, createSearchResultCarousel, getTotalCount, isSingleResult } from '../services/sales/searchService';
import { getConnection } from '../services/database/connection';

async function main() {
  const keyword = process.argv[2] || '충남';

  console.log(`\n========== "${keyword}" 검색 테스트 ==========\n`);

  try {
    const result = await searchAll(keyword);

    console.log('=== 검색 결과 ===');
    console.log(`총 ${getTotalCount(result)}건`);
    console.log(`단일 결과 여부: ${isSingleResult(result)}`);
    console.log('');

    console.log(`[지역] ${result.regions.length}건 (overflow: ${result.regionOverflow})`);
    result.regions.forEach((r, i) => console.log(`  ${i + 1}. ${r.hosIndex}`));

    console.log('');
    console.log(`[병원] ${result.hospitals.length}건 (overflow: ${result.hospitalOverflow})`);
    result.hospitals.forEach((h, i) => console.log(`  ${i + 1}. ${h.hos_name} (${h.hos_cd}|${h.hos_cso_cd})`));

    console.log('');
    console.log(`[약품] ${result.drugs.length}건 (overflow: ${result.drugOverflow})`);
    result.drugs.forEach((d, i) => console.log(`  ${i + 1}. ${d.drug_name} (${d.drug_cd})`));

    console.log('\n=== 캐러셀 JSON ===');
    const carousel = createSearchResultCarousel(keyword, result);
    console.log(JSON.stringify(carousel, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    const pool = await getConnection();
    await pool.close();
    process.exit(0);
  }
}

main();
