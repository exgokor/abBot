/**
 * DRUG 캐러셀 테스트 (의약품 정보 버블 포함 확인)
 * 사용법: npx ts-node src/scripts/test-drug-carousel.ts
 */

import { getDrugSales, createDrugCarousel } from '../services/sales/drugSales';
import { sendFlexMessage } from '../services/naverworks/message';
import { closeConnection } from '../services/database/connection';
import { getCurrentPeriod } from '../services/sales/periodService';

// 테스트용 userId (CLAUDE.md 참조)
const TEST_USER_ID = '73524122-e756-4c53-179e-0378b4ad90b5';

async function main() {
  try {
    // 테스트용 drug_cd (크레트롤정10/10mg)
    const testDrugCd = '8806540047602';

    console.log(`\n========== DRUG 캐러셀 테스트 (의약품 정보 버블 포함) ==========\n`);

    // 1. 기간 정보 조회
    const period = await getCurrentPeriod(3);
    console.log(`조회 기간: ${period.periodText}`);

    // 2. 품목 매출 조회 (의약품 상세 정보 포함)
    const result = await getDrugSales(testDrugCd, period);

    if (!result) {
      console.log(`품목을 찾을 수 없습니다: ${testDrugCd}`);
      process.exit(1);
    }

    console.log('\n=== 조회 결과 ===');
    console.log(`품목명: ${result.drug.drug_name}`);
    console.log(`의약품 상세 정보: ${result.drugDetailInfo ? '있음' : '없음'}`);
    if (result.drugDetailInfo) {
      console.log(`  - 약가: ${result.drugDetailInfo.drug_price}원`);
      console.log(`  - 수수료율: ${(result.drugDetailInfo.drug_dpRate * 100).toFixed(1)}%`);
      console.log(`  - 관리자용 수수료율: ${(result.drugDetailInfo.drug_totRate * 100).toFixed(1)}%`);
      console.log(`  - 제약사: ${result.drugDetailInfo.drug_manufac}`);
      console.log(`  - 성분: ${result.drugDetailInfo.drug_ingr}`);
    }
    console.log(`월평균 매출: ${(result.summary.total_sales / result.periodMonths).toLocaleString()}원`);
    console.log(`거래 병원: ${result.summary.hospital_count}개`);
    console.log(`거래 CSO: ${result.summary.cso_count}명`);

    // 3. 캐러셀 생성 (관리자 모드)
    const carousel = createDrugCarousel(result, true);

    console.log('\n=== 캐러셀 버블 구조 ===');
    console.log(`총 버블 수: ${carousel.contents.length}개`);
    carousel.contents.forEach((bubble: any, index: number) => {
      const headerText = bubble.header?.contents?.[0]?.text || '(헤더 없음)';
      console.log(`  ${index + 1}. ${headerText}`);
    });

    // 4. 테스트 메시지 전송
    console.log('\n=== 메시지 전송 중... ===');
    await sendFlexMessage(TEST_USER_ID, carousel, `[${result.drug.drug_name}] 품목 조회`);
    console.log('메시지 전송 완료!');

  } catch (error) {
    console.error('오류 발생:', error);
  } finally {
    await closeConnection();
    process.exit(0);
  }
}

main();
