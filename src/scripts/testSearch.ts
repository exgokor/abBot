/**
 * 검색 테스트 스크립트
 */

import { searchAll } from '../services/sales/searchService';
import { handleDepth2 } from '../handlers/postbackHandler';
import { getCurrentPeriod } from '../services/sales/periodService';
import { getUserPermission, UserRole } from '../middleware/permission';

const TEST_USER_ID = '73524122-e756-4c53-179e-0378b4ad90b5';
const KEYWORD = '피타렛';

async function test() {
  console.log(`\n=== 검색 테스트: "${KEYWORD}" ===\n`);

  try {
    // 1. 권한 조회
    const permission = await getUserPermission(TEST_USER_ID);
    console.log('권한:', permission?.role || 'USER (기본값)');

    const isAdmin = permission?.role === UserRole.ADMIN || permission?.role === UserRole.SUPER_ADMIN;
    const isSuperAdmin = permission?.role === UserRole.SUPER_ADMIN;
    console.log('isAdmin:', isAdmin);
    console.log('isSuperAdmin:', isSuperAdmin);

    // 2. 검색
    const result = await searchAll(KEYWORD);
    console.log('\n검색 결과:', result.totalCount, '건');
    console.log('- CSO:', result.csoCount);
    console.log('- 병원:', result.hospitalCount);
    console.log('- 품목:', result.drugCount);

    if (result.drugs.length > 0) {
      console.log('\n첫 번째 품목:', result.drugs[0]);
    }

    // 3. 단일 결과면 Depth2 호출
    if (result.totalCount === 1 && result.drugs.length === 1) {
      const drug = result.drugs[0];
      console.log(`\n=== "${drug.search_name}" 조회 메시지 전송 ===\n`);

      const period = await getCurrentPeriod(3);
      await handleDepth2(TEST_USER_ID, 'DRUG', drug.entity_cd, period, isAdmin, isSuperAdmin);

      console.log('메시지 전송 완료!');
    }

    process.exit(0);
  } catch (error) {
    console.error('에러:', error);
    process.exit(1);
  }
}

test();
