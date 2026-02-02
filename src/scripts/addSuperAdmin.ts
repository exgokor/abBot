/**
 * SUPER_ADMIN 추가 스크립트
 */

import { getConnection } from '../services/database/connection';
import sql from 'mssql';

const TARGET_NAME = '양인모';

async function addSuperAdmin() {
  const pool = await getConnection();

  // 1. NaverWorks_UserInfo_TBL에서 이름으로 검색
  const userResult = await pool.request()
    .input('fullName', sql.NVarChar, TARGET_NAME)
    .query(`
      SELECT userId, fullName, email, employmentType, positionName
      FROM NaverWorks_UserInfo_TBL
      WHERE fullName = @fullName
    `);

  if (userResult.recordset.length === 0) {
    console.log(`"${TARGET_NAME}" 사용자를 찾을 수 없습니다.`);
    process.exit(1);
  }

  const user = userResult.recordset[0];
  console.log('\n=== 찾은 사용자 ===');
  console.log(`이름: ${user.fullName}`);
  console.log(`userId: ${user.userId}`);
  console.log(`이메일: ${user.email}`);
  console.log(`고용형태: ${user.employmentType}`);
  console.log(`직책: ${user.positionName}`);

  // 2. UserPermissions에 추가
  const existCheck = await pool.request()
    .input('userId', sql.NVarChar, user.userId)
    .query(`SELECT COUNT(*) AS cnt FROM UserPermissions WHERE userId = @userId`);

  if (existCheck.recordset[0].cnt > 0) {
    await pool.request()
      .input('userId', sql.NVarChar, user.userId)
      .input('role', sql.NVarChar, 'SUPER_ADMIN')
      .query(`UPDATE UserPermissions SET role = @role, updated_at = GETDATE() WHERE userId = @userId`);
    console.log(`\n✓ ${user.fullName}의 권한을 SUPER_ADMIN으로 업데이트했습니다.`);
  } else {
    await pool.request()
      .input('userId', sql.NVarChar, user.userId)
      .input('role', sql.NVarChar, 'SUPER_ADMIN')
      .query(`INSERT INTO UserPermissions (userId, role) VALUES (@userId, @role)`);
    console.log(`\n✓ ${user.fullName}을(를) SUPER_ADMIN으로 추가했습니다.`);
  }

  // 3. 현재 목록 출력
  const allResult = await pool.request().query(`
    SELECT up.userId, up.role, u.fullName, u.email
    FROM UserPermissions up
    LEFT JOIN NaverWorks_UserInfo_TBL u ON up.userId = u.userId
    ORDER BY up.role, u.fullName
  `);

  console.log('\n=== 현재 UserPermissions ===\n');
  allResult.recordset.forEach((row: any, i: number) => {
    console.log(`${i + 1}. [${row.role}] ${row.fullName || row.userId} (${row.email || '-'})`);
  });

  process.exit(0);
}

addSuperAdmin().catch(e => { console.error(e); process.exit(1); });
