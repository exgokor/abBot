/**
 * 특정 유저의 병원별 매출/블록 정보를 캐러셀로 전송하는 테스트
 */
import { getConnection, closeConnection } from './src/services/database/connection';
import { sendFlexMessage } from './src/services/naverworks/message';

const SOURCE_USER_ID = 'a47211b6-4bfd-4265-14ba-030d1eb1b6de';  // 조회 대상
const TARGET_USER_ID = '73524122-e756-4c53-179e-0378b4ad90b5';  // 메시지 수신자

async function main() {
  await getConnection();
  const pool = await getConnection();

  // 1. 유저 정보 조회
  console.log('=== 1. 유저 정보 조회 ===');
  const userResult = await pool.request()
    .input('userId', SOURCE_USER_ID)
    .query(`SELECT * FROM NaverWorks_UserInfo_TBL WHERE userId = @userId`);

  if (userResult.recordset.length === 0) {
    console.log('유저를 찾을 수 없습니다.');
    await closeConnection();
    return;
  }

  const user = userResult.recordset[0];
  console.log(`유저: ${user.fullName} (${user.email})`);

  // 2. CSO 코드 조회 (email로)
  console.log('\n=== 2. CSO 코드 조회 ===');
  const csoResult = await pool.request()
    .input('email', user.email)
    .query(`SELECT cso_cd, cso_dealer_nm, cso_corp_nm, cso_corp_type
            FROM CSO_TBL
            WHERE cso_email = @email AND cso_is_valid = 'Y'`);

  console.log(`CSO 수: ${csoResult.recordset.length}`);
  console.table(csoResult.recordset);

  if (csoResult.recordset.length === 0) {
    console.log('CSO 정보가 없습니다.');
    await closeConnection();
    return;
  }

  // 3. 각 CSO별 블록(담당 병원/품목) 조회
  console.log('\n=== 3. 담당 블록 조회 ===');
  const cso_cd = csoResult.recordset[0].cso_cd;

  const blockResult = await pool.request()
    .input('cso_cd', cso_cd)
    .query(`
      SELECT
        h.hos_name, h.hos_addr1, h.hos_type,
        d.drug_name, d.drug_category,
        b.disease_type
      FROM BLOCK_TBL b
      JOIN HOSPITAL_TBL h ON b.hos_cd = h.hos_cd
      JOIN DRUG_TBL d ON b.drug_cd = d.drug_cd
      WHERE b.cso_cd = @cso_cd AND b.block_isvalid = 'Y'
      ORDER BY h.hos_name, d.drug_name
    `);

  console.log(`담당 블록 수: ${blockResult.recordset.length}`);

  // 4. 병원별 매출 조회 (최근 3개월)
  console.log('\n=== 4. 병원별 매출 조회 (최근 3개월) ===');
  const salesResult = await pool.request()
    .input('cso_cd', cso_cd)
    .query(`
      SELECT
        h.hos_name,
        h.hos_addr1,
        d.drug_name,
        SUM(s.drug_cnt) as total_cnt,
        SUM(s.drug_cnt * s.drug_price) as total_amount,
        s.sales_year,
        s.sales_month
      FROM SALES_TBL s
      JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd
      JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
      WHERE s.cso_cd_then = @cso_cd
        AND s.sales_index >= (YEAR(GETDATE()) * 12 + MONTH(GETDATE())) - 3
      GROUP BY h.hos_name, h.hos_addr1, d.drug_name, s.sales_year, s.sales_month
      ORDER BY total_amount DESC
    `);

  console.log(`매출 데이터 수: ${salesResult.recordset.length}`);

  // 5. 병원별로 그룹핑
  const hospitalSales: Record<string, { addr: string; drugs: any[]; totalAmount: number }> = {};

  for (const row of salesResult.recordset) {
    if (!hospitalSales[row.hos_name]) {
      hospitalSales[row.hos_name] = {
        addr: row.hos_addr1 || '',
        drugs: [],
        totalAmount: 0
      };
    }
    hospitalSales[row.hos_name].drugs.push({
      drug_name: row.drug_name,
      cnt: row.total_cnt,
      amount: row.total_amount
    });
    hospitalSales[row.hos_name].totalAmount += Number(row.total_amount) || 0;
  }

  // 매출 순으로 정렬
  const sortedHospitals = Object.entries(hospitalSales)
    .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
    .slice(0, 10); // 상위 10개만

  console.log('\n=== 병원별 매출 요약 ===');
  for (const [name, data] of sortedHospitals) {
    console.log(`${name} (${data.addr}): ${(data.totalAmount / 10000).toFixed(0)}만원`);
  }

  // 6. 캐러셀 메시지 생성
  if (sortedHospitals.length === 0) {
    console.log('\n매출 데이터가 없어서 블록 정보로 캐러셀 생성');

    // 블록 정보로 캐러셀 생성
    const hospitalBlocks: Record<string, { addr: string; type: string; drugs: string[] }> = {};
    for (const block of blockResult.recordset) {
      if (!hospitalBlocks[block.hos_name]) {
        hospitalBlocks[block.hos_name] = {
          addr: block.hos_addr1 || '',
          type: block.hos_type || '',
          drugs: []
        };
      }
      if (!hospitalBlocks[block.hos_name].drugs.includes(block.drug_name)) {
        hospitalBlocks[block.hos_name].drugs.push(block.drug_name);
      }
    }

    const bubbles = Object.entries(hospitalBlocks).slice(0, 10).map(([hosName, data]) => ({
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: hosName,
            weight: 'bold',
            size: 'lg',
            wrap: true
          },
          {
            type: 'text',
            text: `${data.addr} | ${data.type}`,
            size: 'sm',
            color: '#888888'
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'text',
            text: '담당 품목',
            weight: 'bold',
            size: 'sm',
            margin: 'md'
          },
          ...data.drugs.map(drug => ({
            type: 'text',
            text: `• ${drug}`,
            size: 'sm',
            wrap: true
          }))
        ]
      }
    }));

    const carousel = {
      type: 'carousel',
      contents: bubbles
    };

    console.log('\n캐러셀 생성 완료, 메시지 전송 중...');
    await sendFlexMessage(TARGET_USER_ID, carousel);
    console.log('✓ 메시지 전송 완료!');

  } else {
    // 매출 정보로 캐러셀 생성
    const bubbles = sortedHospitals.map(([hosName, data]) => ({
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: hosName,
            weight: 'bold',
            size: 'lg',
            wrap: true
          },
          {
            type: 'text',
            text: data.addr,
            size: 'sm',
            color: '#888888'
          },
          {
            type: 'text',
            text: `총 매출: ${(data.totalAmount / 10000).toFixed(0)}만원`,
            weight: 'bold',
            size: 'md',
            color: '#1DB446',
            margin: 'md'
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'text',
            text: '품목별 매출',
            weight: 'bold',
            size: 'sm',
            margin: 'md'
          },
          ...data.drugs.slice(0, 5).map(drug => ({
            type: 'text',
            text: `• ${drug.drug_name}: ${(drug.amount / 10000).toFixed(0)}만원`,
            size: 'sm',
            wrap: true
          }))
        ]
      }
    }));

    const carousel = {
      type: 'carousel',
      contents: bubbles
    };

    console.log('\n캐러셀 생성 완료, 메시지 전송 중...');
    await sendFlexMessage(TARGET_USER_ID, carousel);
    console.log('✓ 메시지 전송 완료!');
  }

  await closeConnection();
}

main().catch(console.error);
