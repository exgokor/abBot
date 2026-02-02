/**
 * UserPermissions 테이블 조회
 */

import { getConnection } from '../services/database/connection';

async function listUsers() {
  const pool = await getConnection();

  const result = await pool.request().query(`
    SELECT up.userId, up.role, up.created_at
    FROM UserPermissions up
    ORDER BY up.role, up.created_at
  `);

  console.log('\n=== UserPermissions 테이블 ===\n');

  if (result.recordset.length === 0) {
    console.log('등록된 사용자가 없습니다.');
  } else {
    result.recordset.forEach((row: any, i: number) => {
      console.log(`${i + 1}. [${row.role}] ${row.userId}`);
      console.log(`   등록일: ${row.created_at}`);
    });
  }

  console.log(`\n총 ${result.recordset.length}명`);
  process.exit(0);
}

listUsers().catch(e => { console.error(e); process.exit(1); });
