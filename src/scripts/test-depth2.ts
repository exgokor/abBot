/**
 * Depth2 테스트 스크립트
 *
 * 실행:
 *   npx ts-node src/scripts/test-depth2.ts cso [cso_cd]
 *   npx ts-node src/scripts/test-depth2.ts hospital [hos_cd|hos_cso_cd]
 *   npx ts-node src/scripts/test-depth2.ts drug [drug_cd]
 */

import { getCsoSales, createCsoCarousel } from '../services/sales/csoSales';
import { getHospitalSales, createHospitalCarousel } from '../services/sales/hospitalSales';
import { getDrugSales, createDrugCarousel } from '../services/sales/drugSales';
import { getCurrentPeriod } from '../services/sales/periodService';
import { sendFlexMessage, sendTextMessage } from '../services/naverworks/message';
import { closeConnection } from '../services/database/connection';
import { formatDrugName } from '../utils/drugNameFormatter';

const TEST_USER_ID = '73524122-e756-4c53-179e-0378b4ad90b5';

async function testCsoDepth2(cso_cd: string) {
  console.log(`=== Depth2 CSO 테스트 ===`);
  console.log(`CSO 코드: ${cso_cd}`);
  console.log();

  // 기간 정보 조회
  const period = await getCurrentPeriod(3);
  console.log(`조회 기간: ${period.periodText}`);
  console.log();

  // CSO 매출 조회
  console.log('CSO 매출 조회 중...');
  const result = await getCsoSales(cso_cd, period);

  if (!result) {
    console.log('CSO를 찾을 수 없습니다.');
    await sendTextMessage(TEST_USER_ID, `CSO 코드 "${cso_cd}"를 찾을 수 없습니다.`);
    return;
  }

  console.log(`CSO명: ${result.cso.cso_dealer_nm}`);
  console.log(`법인명: ${result.cso.cso_corp_nm || '-'}`);
  console.log(`총 매출: ${result.summary.total_sales.toLocaleString()}원`);
  console.log(`거래 병원: ${result.summary.hospital_count}개`);
  console.log(`거래 품목: ${result.summary.drug_count}개`);
  console.log();

  console.log(`TOP 병원 (${result.topHospitals.length}개):`);
  result.topHospitals.slice(0, 5).forEach((h, i) => {
    console.log(`  ${i + 1}. ${h.hos_abbr || h.hos_name}: ${h.total_sales.toLocaleString()}원`);
  });
  if (result.topHospitals.length > 5) {
    console.log(`  ... 외 ${result.topHospitals.length - 5}개`);
  }
  console.log();

  console.log(`TOP 품목 (${result.topDrugs.length}개):`);
  result.topDrugs.slice(0, 5).forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.drug_name}: ${d.total_sales.toLocaleString()}원`);
  });
  if (result.topDrugs.length > 5) {
    console.log(`  ... 외 ${result.topDrugs.length - 5}개`);
  }
  console.log();

  // 캐러셀 생성 및 전송
  console.log('캐러셀 생성 및 전송 중...');
  const carousel = createCsoCarousel(result);
  console.log(`버블 개수: ${carousel.contents.length}`);

  await sendFlexMessage(TEST_USER_ID, carousel, `[${result.cso.cso_dealer_nm}] CSO 조회`);
  console.log('전송 완료!');
}

async function testHospitalDepth2(hos_cd: string, hos_cso_cd: string) {
  console.log(`=== Depth2 HOSPITAL 테스트 ===`);
  console.log(`병원 코드: ${hos_cd}|${hos_cso_cd}`);
  console.log();

  // 기간 정보 조회
  const period = await getCurrentPeriod(3);
  console.log(`조회 기간: ${period.periodText}`);
  console.log();

  // 병원 매출 조회
  console.log('병원 매출 조회 중...');
  const result = await getHospitalSales(hos_cd, hos_cso_cd, period);

  if (!result) {
    console.log('병원을 찾을 수 없습니다.');
    await sendTextMessage(TEST_USER_ID, `병원 코드 "${hos_cd}|${hos_cso_cd}"를 찾을 수 없습니다.`);
    return;
  }

  console.log(`병원명: ${result.hospital.hos_name}`);
  console.log(`약칭: ${result.hospital.hos_abbr || '-'}`);
  console.log(`총 매출: ${result.summary.total_sales.toLocaleString()}원`);
  console.log(`거래 품목: ${result.summary.drug_count}개`);
  console.log(`거래 CSO: ${result.summary.cso_count}명`);
  console.log();

  console.log(`TOP 품목 (${result.topDrugs.length}개):`);
  result.topDrugs.slice(0, 5).forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.drug_name}: ${d.total_sales.toLocaleString()}원`);
  });
  if (result.topDrugs.length > 5) {
    console.log(`  ... 외 ${result.topDrugs.length - 5}개`);
  }
  console.log();

  console.log(`TOP CSO (${result.topCsos.length}명):`);
  result.topCsos.slice(0, 5).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.cso_dealer_nm}: ${c.total_sales.toLocaleString()}원`);
  });
  if (result.topCsos.length > 5) {
    console.log(`  ... 외 ${result.topCsos.length - 5}명`);
  }
  console.log();

  // 캐러셀 생성 및 전송
  console.log('캐러셀 생성 및 전송 중...');
  const carousel = createHospitalCarousel(result);
  console.log(`버블 개수: ${carousel.contents.length}`);

  const hospitalTitle = result.hospital.hos_abbr || result.hospital.hos_name;
  await sendFlexMessage(TEST_USER_ID, carousel, `[${hospitalTitle}] 병원 조회`);
  console.log('전송 완료!');
}

async function testDrugDepth2(drug_cd: string) {
  console.log(`=== Depth2 DRUG 테스트 ===`);
  console.log(`품목 코드: ${drug_cd}`);
  console.log();

  // 기간 정보 조회
  const period = await getCurrentPeriod(3);
  console.log(`조회 기간: ${period.periodText}`);
  console.log();

  // 품목 매출 조회
  console.log('품목 매출 조회 중...');
  const result = await getDrugSales(drug_cd, period);

  if (!result) {
    console.log('품목을 찾을 수 없습니다.');
    await sendTextMessage(TEST_USER_ID, `품목 코드 "${drug_cd}"를 찾을 수 없습니다.`);
    return;
  }

  console.log(`품목명: ${result.drug.drug_name}`);
  console.log(`총 매출: ${result.summary.total_sales.toLocaleString()}원`);
  console.log(`거래 병원: ${result.summary.hospital_count}개`);
  console.log(`거래 CSO: ${result.summary.cso_count}명`);
  console.log();

  console.log(`TOP 병원 (${result.topHospitals.length}개):`);
  result.topHospitals.slice(0, 5).forEach((h, i) => {
    console.log(`  ${i + 1}. ${h.hos_abbr || h.hos_name}: ${h.total_sales.toLocaleString()}원`);
  });
  if (result.topHospitals.length > 5) {
    console.log(`  ... 외 ${result.topHospitals.length - 5}개`);
  }
  console.log();

  console.log(`TOP CSO (${result.topCsos.length}명):`);
  result.topCsos.slice(0, 5).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.cso_dealer_nm}: ${c.total_sales.toLocaleString()}원`);
  });
  if (result.topCsos.length > 5) {
    console.log(`  ... 외 ${result.topCsos.length - 5}명`);
  }
  console.log();

  // 캐러셀 생성 및 전송
  console.log('캐러셀 생성 및 전송 중...');
  const carousel = createDrugCarousel(result);
  console.log(`버블 개수: ${carousel.contents.length}`);

  const drugTitle = formatDrugName(result.drug.drug_name);
  await sendFlexMessage(TEST_USER_ID, carousel, `[${drugTitle}] 품목 조회`);
  console.log('전송 완료!');
}

async function main() {
  const type = process.argv[2] || 'cso';
  const code = process.argv[3];

  try {
    switch (type.toLowerCase()) {
      case 'cso':
        // 테스트용 CSO 코드 (없으면 DB에서 첫번째 조회)
        let csoCode = code;
        if (!csoCode) {
          const { executeQuery } = await import('../services/database/queries');
          const result = await executeQuery<{ cso_cd: string }>(
            `SELECT TOP 1 cso_cd FROM CSO_TBL WHERE cso_is_valid = 'Y' ORDER BY cso_cd`
          );
          csoCode = result[0]?.cso_cd;
          console.log(`테스트용 CSO 코드 자동 선택: ${csoCode}`);
        }
        if (csoCode) {
          await testCsoDepth2(csoCode);
        } else {
          console.log('CSO 코드를 찾을 수 없습니다.');
        }
        break;

      case 'hospital':
        // 테스트용 병원 코드 (없으면 DB에서 첫번째 조회)
        let hosCode: string | undefined = code;
        if (!hosCode) {
          const { executeQuery } = await import('../services/database/queries');
          const result = await executeQuery<{ hos_cd: string; hos_cso_cd: string }>(
            `SELECT TOP 1 hos_cd, hos_cso_cd FROM HOSPITAL_TBL ORDER BY hos_cd`
          );
          hosCode = result[0] ? `${result[0].hos_cd}|${result[0].hos_cso_cd}` : undefined;
          console.log(`테스트용 병원 코드 자동 선택: ${hosCode}`);
        }
        if (hosCode) {
          const [hosCd, hosCsoCd] = hosCode.split('|');
          if (hosCd && hosCsoCd) {
            await testHospitalDepth2(hosCd, hosCsoCd);
          } else {
            console.log('병원 코드 형식이 잘못되었습니다. 형식: hos_cd|hos_cso_cd');
          }
        } else {
          console.log('병원 코드를 찾을 수 없습니다.');
        }
        break;

      case 'drug':
        // 테스트용 품목 코드 (없으면 DB에서 첫번째 조회)
        let drugCode: string | undefined = code;
        if (!drugCode) {
          const { executeQuery } = await import('../services/database/queries');
          const result = await executeQuery<{ drug_cd: string }>(
            `SELECT TOP 1 drug_cd FROM DRUG_TBL WHERE drug_isvalid = 'Y' ORDER BY drug_cd`
          );
          drugCode = result[0]?.drug_cd;
          console.log(`테스트용 품목 코드 자동 선택: ${drugCode}`);
        }
        if (drugCode) {
          await testDrugDepth2(drugCode);
        } else {
          console.log('품목 코드를 찾을 수 없습니다.');
        }
        break;

      default:
        console.log('사용법: npx ts-node src/scripts/test-depth2.ts [cso|hospital|drug] [code]');
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
