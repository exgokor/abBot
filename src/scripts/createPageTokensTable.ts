/**
 * PageTokens 테이블 생성 스크립트
 * 블록 수정 페이지 접근용 토큰 저장
 */

import { getConnection } from '../services/database/connection';

async function createPageTokensTable() {
  console.log('PageTokens 테이블 생성 시작...\n');

  try {
    const pool = await getConnection();

    // 테이블 존재 여부 확인
    const checkResult = await pool.request().query(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'PageTokens'
    `);

    if (checkResult.recordset[0].cnt > 0) {
      console.log('PageTokens 테이블이 이미 존재합니다.');
    } else {
      // 테이블 생성
      await pool.request().query(`
        CREATE TABLE PageTokens (
          uuid NVARCHAR(50) PRIMARY KEY,
          token NVARCHAR(100) NOT NULL,
          hos_cd NVARCHAR(20) NOT NULL,
          hos_cso_cd NVARCHAR(20) NOT NULL,
          user_id NVARCHAR(100) NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT GETDATE()
        )
      `);
      console.log('PageTokens 테이블 생성 완료');

      // 인덱스 생성
      await pool.request().query(`
        CREATE INDEX IX_PageTokens_expires ON PageTokens(expires_at)
      `);
      console.log('IX_PageTokens_expires 인덱스 생성 완료');
    }

    console.log('\n테이블 생성 완료!');
    process.exit(0);
  } catch (error) {
    console.error('테이블 생성 실패:', error);
    process.exit(1);
  }
}

createPageTokensTable();
