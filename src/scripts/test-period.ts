/**
 * periodService 테스트 스크립트
 *
 * 실행: npx ts-node src/scripts/test-period.ts
 */

import { getCurrentPeriod, indexToYearMonth, yearMonthToIndex, formatPeriodText } from '../services/sales/periodService';
import { closeConnection } from '../services/database/connection';

async function main() {
  console.log('=== Period Service 테스트 ===\n');

  try {
    // 1. 현재 기간 조회 (기본 3개월)
    console.log('1. 현재 기간 조회 (3개월):');
    const period3m = await getCurrentPeriod(3);
    console.log(`   startIndex: ${period3m.startIndex}`);
    console.log(`   endIndex: ${period3m.endIndex}`);
    console.log(`   기간: ${period3m.periodText}`);
    console.log(`   시작: ${period3m.startYear}년 ${period3m.startMonth}월`);
    console.log(`   종료: ${period3m.endYear}년 ${period3m.endMonth}월`);
    console.log();

    // 2. 6개월 기간 조회
    console.log('2. 6개월 기간 조회:');
    const period6m = await getCurrentPeriod(6);
    console.log(`   기간: ${period6m.periodText}`);
    console.log();

    // 3. index <-> year/month 변환 테스트
    console.log('3. Index 변환 테스트:');
    const testIndex = period3m.endIndex;
    const { year, month } = indexToYearMonth(testIndex);
    const backToIndex = yearMonthToIndex(year, month);
    console.log(`   index ${testIndex} -> ${year}년 ${month}월 -> index ${backToIndex}`);
    console.log(`   변환 일치: ${testIndex === backToIndex ? 'OK' : 'FAIL'}`);
    console.log();

    // 4. formatPeriodText 테스트
    console.log('4. formatPeriodText 테스트:');
    const formatted = formatPeriodText(period3m.startIndex, period3m.endIndex);
    console.log(`   ${formatted}`);
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
