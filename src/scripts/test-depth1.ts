/**
 * Depth1 검색 테스트 스크립트
 *
 * 실행: npx ts-node src/scripts/test-depth1.ts [keyword]
 * 예시:
 *   npx ts-node src/scripts/test-depth1.ts 삼성      # 복수 결과
 *   npx ts-node src/scripts/test-depth1.ts xxxxx    # 결과 없음
 *   npx ts-node src/scripts/test-depth1.ts 특정병원  # 단일 결과
 */

import { searchAll, getTotalCount, isSingleResult, isTooManyResults, getSingleEntity, createSearchResultCarousel } from '../services/sales/searchService';
import { getCurrentPeriod } from '../services/sales/periodService';
import { sendTextMessage, sendFlexMessage } from '../services/naverworks/message';
import { closeConnection } from '../services/database/connection';

// 테스트 UserId (CLAUDE.md에 명시됨)
const TEST_USER_ID = '73524122-e756-4c53-179e-0378b4ad90b5';

async function main() {
  const keyword = process.argv[2] || '삼성';

  console.log(`=== Depth1 검색 테스트 ===`);
  console.log(`검색어: "${keyword}"`);
  console.log(`테스트 UserId: ${TEST_USER_ID}`);
  console.log();

  try {
    // 1. 기간 정보 조회
    console.log('1. 기간 정보 조회...');
    const period = await getCurrentPeriod(3);
    console.log(`   기간: ${period.periodText}`);
    console.log();

    // 2. 검색 실행
    console.log('2. 검색 실행...');
    const result = await searchAll(keyword);
    const totalCount = getTotalCount(result);

    console.log(`   총 결과: ${totalCount}건`);
    console.log(`   - CSO: ${result.csoCount}건`);
    console.log(`   - 병원: ${result.hospitalCount}건`);
    console.log(`   - 품목: ${result.drugCount}건`);
    console.log();

    // 3. 결과 분기 처리
    console.log('3. 결과 분기 처리...');

    if (totalCount === 0) {
      console.log('   → 결과 없음');
      await sendTextMessage(TEST_USER_ID, `"${keyword}" 검색 결과가 없습니다.\n다른 검색어를 입력해주세요.`);
      console.log('   메시지 전송 완료');
    } else if (isTooManyResults(result)) {
      console.log(`   → 결과 너무 많음 (${totalCount}개 > 20개)`);
      await sendTextMessage(
        TEST_USER_ID,
        `"${keyword}" 검색 결과가 ${totalCount}건으로 너무 많습니다.\n검색어를 더 정확하게 입력해주세요.`
      );
      console.log('   메시지 전송 완료');
    } else if (isSingleResult(result)) {
      const entity = getSingleEntity(result);
      console.log(`   → 단일 결과: ${entity?.entity_type} - ${entity?.search_name}`);

      // 단일 결과도 캐러셀로 표시 (테스트용)
      const carousel = createSearchResultCarousel(keyword, result, period.periodText);
      await sendFlexMessage(TEST_USER_ID, carousel, `[${keyword}] 검색 완료`);
      console.log('   캐러셀 전송 완료');
    } else {
      console.log(`   → 복수 결과 (${totalCount}개)`);

      // 상세 결과 출력
      if (result.csos.length > 0) {
        console.log(`   CSO 목록:`);
        result.csos.slice(0, 5).forEach((c, i) => {
          console.log(`     ${i + 1}. ${c.search_name} (${c.entity_cd})`);
        });
        if (result.csos.length > 5) {
          console.log(`     ... 외 ${result.csos.length - 5}건`);
        }
      }

      if (result.hospitals.length > 0) {
        console.log(`   병원 목록:`);
        result.hospitals.slice(0, 5).forEach((h, i) => {
          console.log(`     ${i + 1}. ${h.search_abbr || h.search_name} (${h.entity_cd})`);
        });
        if (result.hospitals.length > 5) {
          console.log(`     ... 외 ${result.hospitals.length - 5}건`);
        }
      }

      if (result.drugs.length > 0) {
        console.log(`   품목 목록:`);
        result.drugs.slice(0, 5).forEach((d, i) => {
          console.log(`     ${i + 1}. ${d.search_name} (${d.entity_cd})`);
        });
        if (result.drugs.length > 5) {
          console.log(`     ... 외 ${result.drugs.length - 5}건`);
        }
      }

      // 캐러셀 전송
      console.log();
      console.log('4. 캐러셀 메시지 전송...');
      const carousel = createSearchResultCarousel(keyword, result, period.periodText);
      await sendFlexMessage(TEST_USER_ID, carousel, `[${keyword}] 검색 완료`);
      console.log('   전송 완료!');
    }

    console.log();
    console.log('=== 테스트 완료 ===');

  } catch (error) {
    console.error('테스트 중 에러 발생:', error);
  } finally {
    await closeConnection();
    process.exit(0);
  }
}

main();
