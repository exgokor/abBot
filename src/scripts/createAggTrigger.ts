/**
 * AGG_CSO_HOSPITAL_MONTHLY 테이블 자동 갱신 트리거 생성
 *
 * SALES_TBL에 INSERT/UPDATE/DELETE 발생 시 집계 테이블 자동 갱신
 *
 * 사용법: npx ts-node src/scripts/createAggTrigger.ts
 *
 * 주의:
 * - 대량 INSERT 시 성능 저하 가능
 * - 필요 없으면 트리거 삭제: DROP TRIGGER TR_SALES_AGG_UPDATE
 */

import dotenv from 'dotenv';
dotenv.config();

import sql from 'mssql';
import { sqlConfig } from '../config/database';

async function main() {
  console.log('AGG_CSO_HOSPITAL_MONTHLY 자동 갱신 트리거 생성...\n');

  const pool = await sql.connect(sqlConfig);

  try {
    // 1. 기존 트리거 삭제
    console.log('1. 기존 트리거 확인 및 삭제...');
    await pool.request().query(`
      IF OBJECT_ID('TR_SALES_AGG_UPDATE', 'TR') IS NOT NULL
        DROP TRIGGER TR_SALES_AGG_UPDATE
    `);
    console.log('   완료\n');

    // 2. 트리거 생성
    console.log('2. 트리거 생성 중...');
    await pool.request().query(`
      CREATE TRIGGER TR_SALES_AGG_UPDATE
      ON SALES_TBL
      AFTER INSERT, UPDATE, DELETE
      AS
      BEGIN
        SET NOCOUNT ON;

        -- 영향받은 (hos_cd, hos_cso_cd, cso_cd, sales_index) 조합 추출
        -- inserted: INSERT/UPDATE 후 데이터
        -- deleted: UPDATE/DELETE 전 데이터
        DECLARE @affected TABLE (
          hos_cd NVARCHAR(50),
          hos_cso_cd NVARCHAR(50),
          cso_cd NVARCHAR(50),
          sales_index INT
        );

        INSERT INTO @affected (hos_cd, hos_cso_cd, cso_cd, sales_index)
        SELECT DISTINCT hos_cd, hos_cso_cd, cso_cd_then, sales_index FROM inserted
        UNION
        SELECT DISTINCT hos_cd, hos_cso_cd, cso_cd_then, sales_index FROM deleted;

        -- 영향받은 행만 삭제
        DELETE agg
        FROM AGG_CSO_HOSPITAL_MONTHLY agg
        INNER JOIN @affected a
          ON agg.hos_cd = a.hos_cd
          AND agg.hos_cso_cd = a.hos_cso_cd
          AND agg.cso_cd = a.cso_cd
          AND agg.sales_index = a.sales_index;

        -- 영향받은 조합에 대해 재집계하여 INSERT
        INSERT INTO AGG_CSO_HOSPITAL_MONTHLY (
          cso_cd, cso_dealer_nm, hos_cd, hos_cso_cd,
          hos_name, hos_abbr, sales_year, sales_month,
          sales_index, total_sales
        )
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
        FROM SALES_TBL s
        INNER JOIN @affected a
          ON s.hos_cd = a.hos_cd
          AND s.hos_cso_cd = a.hos_cso_cd
          AND s.cso_cd_then = a.cso_cd
          AND s.sales_index = a.sales_index
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
          s.sales_index;
      END
    `);
    console.log('   완료\n');

    // 3. 트리거 확인
    const triggerInfo = await pool.request().query(`
      SELECT name, create_date, modify_date
      FROM sys.triggers
      WHERE name = 'TR_SALES_AGG_UPDATE'
    `);

    if (triggerInfo.recordset.length > 0) {
      console.log('✅ 트리거 생성 완료!');
      console.log(`   이름: ${triggerInfo.recordset[0].name}`);
      console.log(`   생성일: ${triggerInfo.recordset[0].create_date}`);
    }

    console.log('\n📌 참고:');
    console.log('- SALES_TBL 변경 시 AGG_CSO_HOSPITAL_MONTHLY 자동 갱신됨');
    console.log('- 대량 INSERT 시 성능 영향 있을 수 있음');
    console.log('- 트리거 삭제: DROP TRIGGER TR_SALES_AGG_UPDATE');

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
