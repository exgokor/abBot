/**
 * CSO-병원별 월별 매출 집계 테이블 생성
 *
 * 뷰(V_CSO_HOSPITAL_MONTHLY_byClaude)는 매번 SALES_TBL을 실시간 집계하므로 느림.
 * 이 스크립트는 물리적 집계 테이블을 생성하여 조회 성능을 개선함.
 *
 * 사용법: npx ts-node src/scripts/createAggregateTable.ts
 *
 * 주의: 매출 데이터가 변경되면 이 스크립트를 다시 실행해야 함
 */

import dotenv from 'dotenv';
dotenv.config();

import sql from 'mssql';
import { sqlConfig } from '../config/database';

async function main() {
  console.log('CSO-병원별 월별 매출 집계 테이블 생성 시작...\n');

  const pool = await sql.connect(sqlConfig);

  try {
    // 1. 기존 테이블 삭제 (있으면)
    console.log('1. 기존 테이블 확인 및 삭제...');
    await pool.request().query(`
      IF OBJECT_ID('AGG_CSO_HOSPITAL_MONTHLY', 'U') IS NOT NULL
        DROP TABLE AGG_CSO_HOSPITAL_MONTHLY
    `);
    console.log('   완료\n');

    // 2. 집계 테이블 생성
    console.log('2. 집계 테이블 생성 중... (시간이 걸릴 수 있습니다)');
    const startTime = Date.now();

    await pool.request().query(`
      SELECT
        s.cso_cd_then AS cso_cd,
        c.cso_dealer_nm,
        s.hos_cd,
        s.hos_cso_cd,
        h.hos_name,
        h.hos_abbr,
        s.sales_year,
        s.sales_month,
        s.sales_index,
        SUM(s.drug_cnt * s.drug_price) AS total_sales
      INTO AGG_CSO_HOSPITAL_MONTHLY
      FROM SALES_TBL s
      LEFT JOIN CSO_TBL c ON s.cso_cd_then = c.cso_cd
      LEFT JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd AND s.hos_cso_cd = h.hos_cso_cd
      GROUP BY
        s.cso_cd_then,
        c.cso_dealer_nm,
        s.hos_cd,
        s.hos_cso_cd,
        h.hos_name,
        h.hos_abbr,
        s.sales_year,
        s.sales_month,
        s.sales_index
    `);

    const elapsed = Date.now() - startTime;
    console.log(`   완료 (${elapsed}ms)\n`);

    // 3. 인덱스 생성
    console.log('3. 인덱스 생성 중...');

    // 병원 조회용 복합 인덱스 (가장 중요)
    await pool.request().query(`
      CREATE NONCLUSTERED INDEX IX_AGG_CSO_HOSPITAL_HOS
      ON AGG_CSO_HOSPITAL_MONTHLY (hos_cd, hos_cso_cd, sales_index)
      INCLUDE (cso_cd, cso_dealer_nm, total_sales)
    `);
    console.log('   - IX_AGG_CSO_HOSPITAL_HOS 생성 완료');

    // CSO 조회용 인덱스
    await pool.request().query(`
      CREATE NONCLUSTERED INDEX IX_AGG_CSO_HOSPITAL_CSO
      ON AGG_CSO_HOSPITAL_MONTHLY (cso_cd, sales_index)
      INCLUDE (hos_cd, hos_cso_cd, hos_name, total_sales)
    `);
    console.log('   - IX_AGG_CSO_HOSPITAL_CSO 생성 완료\n');

    // 4. 행 수 확인
    const countResult = await pool.request().query(`
      SELECT COUNT(*) AS row_count FROM AGG_CSO_HOSPITAL_MONTHLY
    `);
    console.log(`4. 총 ${countResult.recordset[0].row_count.toLocaleString()}개 행 생성됨\n`);

    // 5. 샘플 데이터 확인
    console.log('5. 샘플 데이터 (TOP 5):');
    const sampleResult = await pool.request().query(`
      SELECT TOP 5 cso_cd, cso_dealer_nm, hos_cd, hos_name, sales_index, total_sales
      FROM AGG_CSO_HOSPITAL_MONTHLY
      ORDER BY total_sales DESC
    `);
    console.table(sampleResult.recordset);

    console.log('\n✅ 집계 테이블 생성 완료!');
    console.log('\n다음 단계:');
    console.log('1. hospitalSales.ts에서 V_CSO_HOSPITAL_MONTHLY_byClaude 대신');
    console.log('   AGG_CSO_HOSPITAL_MONTHLY 테이블을 사용하도록 수정');
    console.log('2. 매출 데이터 변경 시 이 스크립트를 다시 실행');

  } catch (error) {
    console.error('오류 발생:', error);
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
