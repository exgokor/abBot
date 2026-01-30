/**
 * 성능 병목 테스트 스크립트
 * 로컬에서 실행하여 각 단계별 소요 시간 측정
 *
 * 실행: npx ts-node src/scripts/test-performance.ts
 */

import { getConnection } from '../services/database/connection';
import { searchAll } from '../services/sales/searchService';
import { getHospitalSales } from '../services/sales/hospitalSales';
import { getCsoSales } from '../services/sales/csoSales';
import { getDrugSales } from '../services/sales/drugSales';
import { getCurrentPeriod } from '../services/sales/periodService';

// 시간 측정 유틸리티
function measureTime(label: string) {
  const start = Date.now();
  return {
    end: () => {
      const elapsed = Date.now() - start;
      console.log(`  ⏱️  ${label}: ${elapsed}ms`);
      return elapsed;
    }
  };
}

async function testPerformance() {
  console.log('==========================================');
  console.log('🔍 성능 병목 테스트 시작');
  console.log('==========================================\n');

  // 1. DB 연결 테스트
  console.log('📌 1. DB 연결');
  let timer = measureTime('첫 번째 연결');
  await getConnection();
  timer.end();

  timer = measureTime('두 번째 연결 (캐시됨)');
  await getConnection();
  timer.end();

  // 2. 기간 조회 테스트
  console.log('\n📌 2. 기간 조회 (getCurrentPeriod)');
  timer = measureTime('기간 조회');
  const period = await getCurrentPeriod(3);
  timer.end();
  console.log(`     기간: ${period.periodText}`);

  // 3. 검색 쿼리 테스트 (LIKE)
  console.log('\n📌 3. 검색 쿼리 (searchAll - LIKE)');
  const keywords = ['삼성', '세브란스', '김', '리피어'];

  for (const keyword of keywords) {
    timer = measureTime(`검색: "${keyword}"`);
    const result = await searchAll(keyword);
    const elapsed = timer.end();
    console.log(`     결과: ${result.totalCount}건 (${elapsed}ms)`);
  }

  // 4. Depth2 HOSPITAL 조회 테스트
  console.log('\n📌 4. Depth2 HOSPITAL 조회');
  // 테스트용 병원 코드 (실제 데이터로 교체 필요)
  const testHospitals = [
    { hos_cd: '1000011', hos_cso_cd: '23304', name: '테스트병원1' },
  ];

  for (const hos of testHospitals) {
    console.log(`\n   병원: ${hos.name} (${hos.hos_cd}|${hos.hos_cso_cd})`);

    timer = measureTime('getHospitalSales 전체');
    const result = await getHospitalSales(hos.hos_cd, hos.hos_cso_cd, period);
    const totalTime = timer.end();

    if (result) {
      console.log(`     품목수: ${result.summary.drug_count}, CSO수: ${result.summary.cso_count}`);
    } else {
      console.log('     결과 없음');
    }
  }

  // 5. Depth2 CSO 조회 테스트
  console.log('\n📌 5. Depth2 CSO 조회');
  const testCsos = ['CSO001', 'CSO002'];  // 실제 CSO 코드로 교체 필요

  for (const csoCd of testCsos) {
    timer = measureTime(`getCsoSales: ${csoCd}`);
    try {
      const result = await getCsoSales(csoCd, period);
      timer.end();
      if (result) {
        console.log(`     CSO명: ${result.cso.cso_dealer_nm}`);
      }
    } catch (e) {
      timer.end();
      console.log(`     에러 또는 데이터 없음`);
    }
  }

  // 6. Depth2 DRUG 조회 테스트
  console.log('\n📌 6. Depth2 DRUG 조회');
  const testDrugs = ['D001', 'D002'];  // 실제 품목 코드로 교체 필요

  for (const drugCd of testDrugs) {
    timer = measureTime(`getDrugSales: ${drugCd}`);
    try {
      const result = await getDrugSales(drugCd, period);
      timer.end();
      if (result) {
        console.log(`     품목명: ${result.drug.drug_name}`);
      }
    } catch (e) {
      timer.end();
      console.log(`     에러 또는 데이터 없음`);
    }
  }

  // 7. 상세 HOSPITAL 쿼리 분석
  console.log('\n📌 7. HOSPITAL 상세 쿼리 분석');
  await testHospitalQueriesDetailed(period);

  console.log('\n==========================================');
  console.log('✅ 성능 테스트 완료');
  console.log('==========================================');

  process.exit(0);
}

/**
 * HOSPITAL 쿼리 상세 분석
 * getHospitalSales 내부의 7개 쿼리를 개별 측정
 */
async function testHospitalQueriesDetailed(period: any) {
  const pool = await getConnection();
  const hos_cd = '1000011';  // 실제 값으로 교체
  const hos_cso_cd = '23304';
  const { startIndex, endIndex } = period;

  console.log(`   병원: ${hos_cd}|${hos_cso_cd}, 기간: ${startIndex}~${endIndex}`);

  // 쿼리 1: 병원 기본 정보
  let timer = measureTime('병원 기본 정보');
  await pool.request()
    .input('hos_cd', hos_cd)
    .input('hos_cso_cd', hos_cso_cd)
    .query(`
      SELECT hos_cd, hos_cso_cd, hos_name, hos_abbr
      FROM HOSPITAL_TBL
      WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
    `);
  timer.end();

  // 쿼리 2: 월별 매출
  timer = measureTime('월별 매출 (V_HOSPITAL_MONTHLY_SALES)');
  await pool.request()
    .input('hos_cd', hos_cd)
    .input('hos_cso_cd', hos_cso_cd)
    .input('startIndex', startIndex)
    .input('endIndex', endIndex)
    .query(`
      SELECT sales_year, sales_month, sales_index, total_sales
      FROM V_HOSPITAL_MONTHLY_SALES_byClaude
      WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
        AND sales_index BETWEEN @startIndex AND @endIndex
      ORDER BY sales_index
    `);
  timer.end();

  // 쿼리 3: TOP 품목
  timer = measureTime('TOP 품목 (V_HOSPITAL_DRUG_MONTHLY)');
  await pool.request()
    .input('hos_cd', hos_cd)
    .input('hos_cso_cd', hos_cso_cd)
    .input('startIndex', startIndex)
    .input('endIndex', endIndex)
    .input('limit', 10)
    .query(`
      SELECT TOP (@limit)
        hd.drug_cd, hd.drug_name,
        SUM(hd.total_sales) AS total_sales
      FROM V_HOSPITAL_DRUG_MONTHLY_byClaude hd
      WHERE hd.hos_cd = @hos_cd AND hd.hos_cso_cd = @hos_cso_cd
        AND hd.sales_index BETWEEN @startIndex AND @endIndex
      GROUP BY hd.drug_cd, hd.drug_name
      ORDER BY SUM(hd.total_sales) DESC
    `);
  timer.end();

  // 쿼리 4: TOP CSO (SALES_TBL 직접)
  timer = measureTime('TOP CSO (SALES_TBL JOIN)');
  await pool.request()
    .input('hos_cd', hos_cd)
    .input('hos_cso_cd', hos_cso_cd)
    .input('startIndex', startIndex)
    .input('endIndex', endIndex)
    .input('limit', 10)
    .query(`
      SELECT TOP (@limit)
        s.cso_cd_then AS cso_cd,
        ISNULL(c.cso_dealer_nm, '미지정') AS cso_dealer_nm,
        SUM(s.drug_cnt * s.drug_price) AS total_sales
      FROM SALES_TBL s
      LEFT JOIN CSO_TBL c ON s.cso_cd_then = c.cso_cd
      WHERE s.hos_cd = @hos_cd AND s.hos_cso_cd = @hos_cso_cd
        AND s.sales_index BETWEEN @startIndex AND @endIndex
      GROUP BY s.cso_cd_then, c.cso_dealer_nm
      ORDER BY SUM(s.drug_cnt * s.drug_price) DESC
    `);
  timer.end();

  // 쿼리 5: 블록 정보
  timer = measureTime('블록 정보 (V_CURRENT_BLOCKS)');
  await pool.request()
    .input('hos_cd', hos_cd)
    .input('hos_cso_cd', hos_cso_cd)
    .query(`
      SELECT drug_cd, drug_name, cso_cd, cso_dealer_nm, disease_type
      FROM V_CURRENT_BLOCKS_byClaude
      WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
      ORDER BY drug_name, cso_dealer_nm
    `);
  timer.end();

  // 쿼리 6: 검색 인덱스 (LIKE - 전체 스캔)
  timer = measureTime('검색 인덱스 (LIKE %keyword% - 느림)');
  await pool.request()
    .input('keyword', '%삼성%')
    .query(`
      SELECT entity_type, entity_cd, search_name, search_abbr, region
      FROM V_SEARCH_INDEX_byClaude
      WHERE search_name LIKE @keyword
         OR region LIKE @keyword
         OR search_abbr LIKE @keyword
      ORDER BY entity_type, search_name
    `);
  timer.end();

  // 쿼리 7: 검색 인덱스 (LIKE - 인덱스 활용)
  timer = measureTime('검색 인덱스 (LIKE keyword% - 빠름)');
  await pool.request()
    .input('keyword', '삼성%')
    .query(`
      SELECT entity_type, entity_cd, search_name, search_abbr, region
      FROM V_SEARCH_INDEX_byClaude
      WHERE search_name LIKE @keyword
         OR region LIKE @keyword
         OR search_abbr LIKE @keyword
      ORDER BY entity_type, search_name
    `);
  timer.end();
}

// 실행
testPerformance().catch(console.error);
