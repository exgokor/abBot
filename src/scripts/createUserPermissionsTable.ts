/**
 * UserPermissions 테이블 생성 및 초기 데이터 추가
 */

import { getConnection } from '../services/database/connection';
import sql from 'mssql';

async function createUserPermissionsTable() {
  console.log('UserPermissions 테이블 생성 시작...\n');

  try {
    const pool = await getConnection();

    // 테이블 존재 여부 확인
    const checkResult = await pool.request().query(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'UserPermissions'
    `);

    if (checkResult.recordset[0].cnt > 0) {
      console.log('UserPermissions 테이블이 이미 존재합니다.');
    } else {
      // 테이블 생성
      await pool.request().query(`
        CREATE TABLE UserPermissions (
          userId NVARCHAR(100) PRIMARY KEY,
          role NVARCHAR(20) NOT NULL DEFAULT 'USER',
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      `);
      console.log('UserPermissions 테이블 생성 완료');
    }

    // SUPER_ADMIN 유저 추가 (CLAUDE.md에 있는 테스트 유저)
    const testUserId = '73524122-e756-4c53-179e-0378b4ad90b5';

    // 이미 존재하는지 확인
    const existCheck = await pool.request()
      .input('userId', sql.NVarChar, testUserId)
      .query(`SELECT COUNT(*) AS cnt FROM UserPermissions WHERE userId = @userId`);

    if (existCheck.recordset[0].cnt > 0) {
      // 이미 존재하면 업데이트
      await pool.request()
        .input('userId', sql.NVarChar, testUserId)
        .input('role', sql.NVarChar, 'SUPER_ADMIN')
        .query(`UPDATE UserPermissions SET role = @role, updated_at = GETDATE() WHERE userId = @userId`);
      console.log(`유저 ${testUserId} 권한을 SUPER_ADMIN으로 업데이트`);
    } else {
      // 새로 추가
      await pool.request()
        .input('userId', sql.NVarChar, testUserId)
        .input('role', sql.NVarChar, 'SUPER_ADMIN')
        .query(`INSERT INTO UserPermissions (userId, role) VALUES (@userId, @role)`);
      console.log(`유저 ${testUserId}를 SUPER_ADMIN으로 추가`);
    }

    console.log('\n완료!');
    process.exit(0);
  } catch (error) {
    console.error('에러:', error);
    process.exit(1);
  }
}

createUserPermissionsTable();
