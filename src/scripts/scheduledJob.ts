/**
 * NaverWorks 정기 작업 스크립트
 * - Refresh Token 갱신
 * - 사용자 정보 DB 동기화
 *
 * 실행: npx ts-node src/scripts/scheduledJob.ts
 * 또는: npm run scheduled-job
 */

import { runScheduledTasks, createUserInfoTable } from '../services/database/userSync';
import { getConnection, closeConnection } from '../services/database/connection';

async function main() {
  console.log('=== NaverWorks Scheduled Job Started ===');
  console.log(`Time: ${new Date().toISOString()}`);

  try {
    await getConnection();

    // 테이블이 없으면 생성 (최초 실행 시)
    await createUserInfoTable();

    // 정기 작업 실행
    await runScheduledTasks();

    console.log('=== Job Completed Successfully ===');
  } catch (error) {
    console.error('Job failed:', error);
    process.exit(1);
  } finally {
    await closeConnection();
    process.exit(0);
  }
}

main();
