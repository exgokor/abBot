/**
 * 매출조회 챗봇용 뷰 테이블 생성 스크립트
 * 모든 뷰 이름은 _byClaude 접미사를 붙여 구분
 */

import { getConnection, closeConnection } from '../services/database/connection';
import sql from 'mssql';

const VIEW_DEFINITIONS = [
  // 1. V_SALES_DETAIL_byClaude: 매출 상세 (모든 마스터 조인)
  {
    name: 'V_SALES_DETAIL_byClaude',
    sql: `
CREATE VIEW V_SALES_DETAIL_byClaude AS
SELECT
    s.hos_cd,
    s.hos_cso_cd,
    s.drug_cd,
    s.seq,
    s.cso_cd_then,
    s.drug_cnt,
    s.drug_price,
    s.rx_type,
    s.drug_ws_fee,
    s.pay_rate,
    s.sales_year,
    s.sales_month,
    s.sales_index,
    s.pay_year,
    s.pay_month,
    s.pay_index,
    -- CSO 정보
    c.cso_dealer_nm,
    c.cso_corp_nm,
    c.cso_email,
    -- 병원 정보
    h.hos_name,
    h.hos_abbr,
    h.hos_type,
    h.hos_addr1,
    h.hos_addr2,
    h.hosIndex,
    -- 의약품 정보
    d.drug_name,
    d.drug_class,
    d.drug_category,
    d.drug_totRate,
    d.drug_dpRate,
    -- 계산 필드
    (s.drug_cnt * s.drug_price * s.pay_rate) AS sales_amount
FROM SALES_TBL s
LEFT JOIN CSO_TBL c ON s.cso_cd_then = c.cso_cd
LEFT JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd AND s.hos_cso_cd = h.hos_cso_cd
LEFT JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
    AND s.sales_index >= d.start_index
    AND s.sales_index <= d.end_index
`
  },

  // 2. V_CSO_MONTHLY_SALES_byClaude: CSO별 월별 매출 집계
  {
    name: 'V_CSO_MONTHLY_SALES_byClaude',
    sql: `
CREATE VIEW V_CSO_MONTHLY_SALES_byClaude AS
SELECT
    s.cso_cd_then AS cso_cd,
    c.cso_dealer_nm,
    c.cso_corp_nm,
    s.sales_year,
    s.sales_month,
    s.sales_index,
    COUNT(DISTINCT s.hos_cd + s.hos_cso_cd) AS hospital_count,
    COUNT(DISTINCT CASE WHEN s.drug_cnt > 0 THEN s.drug_cd END) AS drug_count,
    COUNT(DISTINCT CASE WHEN s.drug_cnt > 0 THEN d.drug_class END) AS drug_class_count,
    SUM(s.drug_cnt * s.drug_price * s.pay_rate) AS total_sales
FROM SALES_TBL s
LEFT JOIN CSO_TBL c ON s.cso_cd_then = c.cso_cd
LEFT JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
    AND s.sales_index >= d.start_index
    AND s.sales_index <= d.end_index
GROUP BY
    s.cso_cd_then,
    c.cso_dealer_nm,
    c.cso_corp_nm,
    s.sales_year,
    s.sales_month,
    s.sales_index
`
  },

  // 3. V_HOSPITAL_MONTHLY_SALES_byClaude: 병원별 월별 매출 집계
  {
    name: 'V_HOSPITAL_MONTHLY_SALES_byClaude',
    sql: `
CREATE VIEW V_HOSPITAL_MONTHLY_SALES_byClaude AS
SELECT
    s.hos_cd,
    s.hos_cso_cd,
    h.hos_name,
    h.hos_abbr,
    h.hos_type,
    h.hos_addr1,
    h.hos_addr2,
    h.hosIndex,
    s.sales_year,
    s.sales_month,
    s.sales_index,
    COUNT(DISTINCT s.cso_cd_then) AS cso_count,
    COUNT(DISTINCT CASE WHEN s.drug_cnt > 0 THEN s.drug_cd END) AS drug_count,
    COUNT(DISTINCT CASE WHEN s.drug_cnt > 0 THEN d.drug_class END) AS drug_class_count,
    SUM(s.drug_cnt * s.drug_price * s.pay_rate) AS total_sales
FROM SALES_TBL s
LEFT JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd AND s.hos_cso_cd = h.hos_cso_cd
LEFT JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
    AND s.sales_index >= d.start_index
    AND s.sales_index <= d.end_index
GROUP BY
    s.hos_cd,
    s.hos_cso_cd,
    h.hos_name,
    h.hos_abbr,
    h.hos_type,
    h.hos_addr1,
    h.hos_addr2,
    h.hosIndex,
    s.sales_year,
    s.sales_month,
    s.sales_index
`
  },

  // 4. V_DRUG_MONTHLY_SALES_byClaude: 품목별 월별 매출 집계
  {
    name: 'V_DRUG_MONTHLY_SALES_byClaude',
    sql: `
CREATE VIEW V_DRUG_MONTHLY_SALES_byClaude AS
SELECT
    s.drug_cd,
    d.drug_name,
    d.drug_class,
    d.drug_category,
    s.sales_year,
    s.sales_month,
    s.sales_index,
    COUNT(DISTINCT s.hos_cd + s.hos_cso_cd) AS hospital_count,
    COUNT(DISTINCT s.cso_cd_then) AS cso_count,
    SUM(s.drug_cnt) AS total_qty,
    SUM(s.drug_cnt * s.drug_price * s.pay_rate) AS total_sales
FROM SALES_TBL s
LEFT JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
    AND s.sales_index >= d.start_index
    AND s.sales_index <= d.end_index
GROUP BY
    s.drug_cd,
    d.drug_name,
    d.drug_class,
    d.drug_category,
    s.sales_year,
    s.sales_month,
    s.sales_index
`
  },

  // 5. V_REGION_MONTHLY_SALES_byClaude: 지역별 월별 매출 집계
  {
    name: 'V_REGION_MONTHLY_SALES_byClaude',
    sql: `
CREATE VIEW V_REGION_MONTHLY_SALES_byClaude AS
SELECT
    h.hosIndex,
    h.hos_addr1,
    s.sales_year,
    s.sales_month,
    s.sales_index,
    COUNT(DISTINCT s.hos_cd + s.hos_cso_cd) AS hospital_count,
    COUNT(DISTINCT s.cso_cd_then) AS cso_count,
    COUNT(DISTINCT CASE WHEN s.drug_cnt > 0 THEN s.drug_cd END) AS drug_count,
    SUM(s.drug_cnt * s.drug_price * s.pay_rate) AS total_sales
FROM SALES_TBL s
LEFT JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd AND s.hos_cso_cd = h.hos_cso_cd
GROUP BY
    h.hosIndex,
    h.hos_addr1,
    s.sales_year,
    s.sales_month,
    s.sales_index
`
  },

  // 6. V_CSO_HOSPITAL_MONTHLY_byClaude: CSO-병원 조합별 월별 매출
  {
    name: 'V_CSO_HOSPITAL_MONTHLY_byClaude',
    sql: `
CREATE VIEW V_CSO_HOSPITAL_MONTHLY_byClaude AS
SELECT
    s.cso_cd_then AS cso_cd,
    c.cso_dealer_nm,
    s.hos_cd,
    s.hos_cso_cd,
    h.hos_name,
    h.hos_abbr,
    h.hosIndex,
    s.sales_year,
    s.sales_month,
    s.sales_index,
    COUNT(DISTINCT CASE WHEN s.drug_cnt > 0 THEN s.drug_cd END) AS drug_count,
    COUNT(DISTINCT CASE WHEN s.drug_cnt > 0 THEN d.drug_class END) AS drug_class_count,
    SUM(s.drug_cnt * s.drug_price * s.pay_rate) AS total_sales
FROM SALES_TBL s
LEFT JOIN CSO_TBL c ON s.cso_cd_then = c.cso_cd
LEFT JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd AND s.hos_cso_cd = h.hos_cso_cd
LEFT JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
    AND s.sales_index >= d.start_index
    AND s.sales_index <= d.end_index
GROUP BY
    s.cso_cd_then,
    c.cso_dealer_nm,
    s.hos_cd,
    s.hos_cso_cd,
    h.hos_name,
    h.hos_abbr,
    h.hosIndex,
    s.sales_year,
    s.sales_month,
    s.sales_index
`
  },

  // 7. V_CSO_DRUG_MONTHLY_byClaude: CSO-품목 조합별 월별 매출
  {
    name: 'V_CSO_DRUG_MONTHLY_byClaude',
    sql: `
CREATE VIEW V_CSO_DRUG_MONTHLY_byClaude AS
SELECT
    s.cso_cd_then AS cso_cd,
    c.cso_dealer_nm,
    s.drug_cd,
    d.drug_name,
    d.drug_class,
    d.drug_category,
    s.sales_year,
    s.sales_month,
    s.sales_index,
    COUNT(DISTINCT s.hos_cd + s.hos_cso_cd) AS hospital_count,
    SUM(s.drug_cnt) AS total_qty,
    SUM(s.drug_cnt * s.drug_price * s.pay_rate) AS total_sales
FROM SALES_TBL s
LEFT JOIN CSO_TBL c ON s.cso_cd_then = c.cso_cd
LEFT JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
    AND s.sales_index >= d.start_index
    AND s.sales_index <= d.end_index
GROUP BY
    s.cso_cd_then,
    c.cso_dealer_nm,
    s.drug_cd,
    d.drug_name,
    d.drug_class,
    d.drug_category,
    s.sales_year,
    s.sales_month,
    s.sales_index
`
  },

  // 8. V_HOSPITAL_DRUG_MONTHLY_byClaude: 병원-품목 조합별 월별 매출
  {
    name: 'V_HOSPITAL_DRUG_MONTHLY_byClaude',
    sql: `
CREATE VIEW V_HOSPITAL_DRUG_MONTHLY_byClaude AS
SELECT
    s.hos_cd,
    s.hos_cso_cd,
    h.hos_name,
    h.hos_abbr,
    h.hosIndex,
    s.drug_cd,
    d.drug_name,
    d.drug_class,
    s.sales_year,
    s.sales_month,
    s.sales_index,
    COUNT(DISTINCT s.cso_cd_then) AS cso_count,
    SUM(s.drug_cnt) AS total_qty,
    SUM(s.drug_cnt * s.drug_price * s.pay_rate) AS total_sales
FROM SALES_TBL s
LEFT JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd AND s.hos_cso_cd = h.hos_cso_cd
LEFT JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
    AND s.sales_index >= d.start_index
    AND s.sales_index <= d.end_index
GROUP BY
    s.hos_cd,
    s.hos_cso_cd,
    h.hos_name,
    h.hos_abbr,
    h.hosIndex,
    s.drug_cd,
    d.drug_name,
    d.drug_class,
    s.sales_year,
    s.sales_month,
    s.sales_index
`
  },

  // 9. V_CURRENT_BLOCKS_byClaude: 현재 담당자 (end_index가 MAX)
  {
    name: 'V_CURRENT_BLOCKS_byClaude',
    sql: `
CREATE VIEW V_CURRENT_BLOCKS_byClaude AS
SELECT
    b.hos_cd,
    b.hos_cso_cd,
    b.drug_cd,
    b.seq,
    b.cso_cd,
    c.cso_dealer_nm,
    c.cso_email,
    h.hos_name,
    h.hos_abbr,
    h.hosIndex,
    d.drug_name,
    d.drug_class,
    b.disease_type,
    b.isFirst,
    b.start_year,
    b.start_month,
    b.start_index,
    b.end_year,
    b.end_month,
    b.end_index
FROM BLOCK_TBL b
INNER JOIN (
    SELECT hos_cd, hos_cso_cd, drug_cd, seq, MAX(end_index) AS max_end_index
    FROM BLOCK_TBL
    GROUP BY hos_cd, hos_cso_cd, drug_cd, seq
) latest ON b.hos_cd = latest.hos_cd
    AND b.hos_cso_cd = latest.hos_cso_cd
    AND b.drug_cd = latest.drug_cd
    AND b.seq = latest.seq
    AND b.end_index = latest.max_end_index
LEFT JOIN CSO_TBL c ON b.cso_cd = c.cso_cd
LEFT JOIN HOSPITAL_TBL h ON b.hos_cd = h.hos_cd AND b.hos_cso_cd = h.hos_cso_cd
LEFT JOIN DRUG_TBL d ON b.drug_cd = d.drug_cd
`
  },

  // 10. V_BLOCK_HISTORY_byClaude: 블록 변경 이력
  {
    name: 'V_BLOCK_HISTORY_byClaude',
    sql: `
CREATE VIEW V_BLOCK_HISTORY_byClaude AS
SELECT
    b.hos_cd,
    b.hos_cso_cd,
    b.drug_cd,
    b.seq,
    b.cso_cd,
    c.cso_dealer_nm,
    h.hos_name,
    h.hos_abbr,
    d.drug_name,
    b.disease_type,
    b.isFirst,
    b.block_isvalid,
    b.start_year,
    b.start_month,
    b.start_index,
    b.end_year,
    b.end_month,
    b.end_index,
    b.update_at
FROM BLOCK_TBL b
LEFT JOIN CSO_TBL c ON b.cso_cd = c.cso_cd
LEFT JOIN HOSPITAL_TBL h ON b.hos_cd = h.hos_cd AND b.hos_cso_cd = h.hos_cso_cd
LEFT JOIN DRUG_TBL d ON b.drug_cd = d.drug_cd
`
  },

  // 11. V_SEARCH_INDEX_byClaude: 통합 검색용 인덱스
  {
    name: 'V_SEARCH_INDEX_byClaude',
    sql: `
CREATE VIEW V_SEARCH_INDEX_byClaude AS
-- CSO 검색
SELECT 'CSO' AS entity_type, cso_cd AS entity_cd, cso_dealer_nm AS search_name, NULL AS search_abbr, NULL AS region
FROM CSO_TBL WHERE cso_is_valid = 'Y'
UNION ALL
-- 병원 검색
SELECT 'HOSPITAL' AS entity_type, hos_cd + '|' + hos_cso_cd AS entity_cd, hos_name AS search_name, hos_abbr AS search_abbr, hosIndex AS region
FROM HOSPITAL_TBL
UNION ALL
-- 품목 검색
SELECT 'DRUG' AS entity_type, drug_cd AS entity_cd, drug_name AS search_name, NULL AS search_abbr, NULL AS region
FROM DRUG_TBL WHERE drug_isvalid = 'Y'
`
  },

  // 12. V_REGION_SUMMARY_byClaude: 지역별 요약용 (병원/품목 COUNT DISTINCT용)
  {
    name: 'V_REGION_SUMMARY_byClaude',
    sql: `
CREATE VIEW V_REGION_SUMMARY_byClaude AS
SELECT
    h.hosIndex,
    s.sales_index,
    s.hos_cd,
    s.hos_cso_cd,
    s.drug_cd,
    SUM(s.drug_cnt * s.drug_price * s.pay_rate) AS sales_amount
FROM SALES_TBL s
JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd AND s.hos_cso_cd = h.hos_cso_cd
WHERE s.drug_cnt > 0
GROUP BY h.hosIndex, s.sales_index, s.hos_cd, s.hos_cso_cd, s.drug_cd
`
  }
];

async function createViews(): Promise<void> {
  const pool = await getConnection();

  console.log('=== Creating Views (_byClaude suffix) ===\n');

  for (const view of VIEW_DEFINITIONS) {
    try {
      // 기존 뷰가 있으면 삭제
      await pool.request().query(`
        IF OBJECT_ID('${view.name}', 'V') IS NOT NULL
          DROP VIEW ${view.name}
      `);

      // 뷰 생성
      await pool.request().query(view.sql);
      console.log(`✓ Created: ${view.name}`);
    } catch (error: any) {
      console.error(`✗ Failed: ${view.name}`);
      console.error(`  Error: ${error.message}`);
    }
  }

  console.log('\n=== View Creation Complete ===');
}

async function main() {
  try {
    await createViews();
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  } finally {
    await closeConnection();
    process.exit(0);
  }
}

main();
