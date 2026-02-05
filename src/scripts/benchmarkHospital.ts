/**
 * 병원 매출 전체 흐름 벤치마크
 * DB 쿼리 + NaverWorks API 호출 시간 측정
 * 사용법: npx ts-node src/scripts/benchmarkHospital.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import sql from 'mssql';
import axios from 'axios';
import { sqlConfig } from '../config/database';
import { config } from '../config';
import { getEncryptedValue } from '../services/database/envDB';

const TEST_USER_ID = '73524122-e756-4c53-179e-0378b4ad90b5';
const API_BASE_URL = 'https://www.worksapis.com/v1.0';
const MAX_DRUGS = 10;
const MAX_CSOS = 10;

async function timed(label: string, fn: () => Promise<any>): Promise<{ elapsed: number; result: any }> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  return { elapsed, result };
}

async function main() {
  const allSteps: { label: string; elapsed: number }[] = [];

  // === 1. DB 연결 ===
  const { elapsed: dbConnectTime } = await timed('DB연결', async () => {
    return await sql.connect(sqlConfig);
  });
  allSteps.push({ label: 'DB 연결', elapsed: dbConnectTime });
  const pool = await sql.connect(sqlConfig);
  console.log(`DB 연결: ${dbConnectTime}ms\n`);

  // 병원 조회
  const hosResult = await pool.request().query(`
    SELECT TOP 1 hos_cd, hos_cso_cd, hos_name
    FROM HOSPITAL_TBL WHERE hos_name LIKE N'%길병원%'
  `);
  const hos_cd = hosResult.recordset[0].hos_cd;
  const hos_cso_cd = hosResult.recordset[0].hos_cso_cd;
  console.log(`병원: ${hosResult.recordset[0].hos_name} (${hos_cd}|${hos_cso_cd})`);

  // 기간 조회
  const periodResult = await pool.request().query(`SELECT MAX(sales_index) AS max_index FROM SALES_TBL`);
  const endIndex = periodResult.recordset[0].max_index;
  const startIndex = endIndex - 2;
  console.log(`기간: ${startIndex} ~ ${endIndex}\n`);

  // === 2. NaverWorks 토큰 조회 ===
  const { elapsed: tokenTime, result: accessToken } = await timed('토큰조회', async () => {
    return await getEncryptedValue('ACCESS_TOKEN');
  });
  allSteps.push({ label: 'DB: 토큰조회', elapsed: tokenTime });
  console.log(`토큰 조회 (DB): ${tokenTime}ms`);

  // === 3. NaverWorks API: 텍스트 메시지 전송 x3 ===
  console.log('\n=== NaverWorks API 호출 ===');

  for (let i = 1; i <= 3; i++) {
    const { elapsed } = await timed(`메시지${i}`, async () => {
      return await axios.post(
        `${API_BASE_URL}/bots/${config.naverWorks.botId}/users/${TEST_USER_ID}/messages`,
        { content: { type: 'text', text: `[벤치마크] 텍스트 메시지 #${i}` } },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
    });
    allSteps.push({ label: `API: 텍스트#${i}`, elapsed });
    console.log(`  텍스트 메시지 #${i}: ${elapsed}ms`);
  }

  // === 4. DB: 7개 매출 쿼리 (병렬) ===
  const { elapsed: dbQueryTime } = await timed('DB쿼리', async () => {
    return await Promise.all([
      pool.request().input('hos_cd', sql.NVarChar, hos_cd).input('hos_cso_cd', sql.NVarChar, hos_cso_cd).input('startIndex', sql.Int, startIndex).input('endIndex', sql.Int, endIndex)
        .query(`SELECT sales_year, sales_month, sales_index, total_sales FROM V_HOSPITAL_MONTHLY_SALES_byClaude WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND sales_index BETWEEN @startIndex AND @endIndex ORDER BY sales_index`),
      pool.request().input('hos_cd', sql.NVarChar, hos_cd).input('hos_cso_cd', sql.NVarChar, hos_cso_cd).input('startIndex', sql.Int, startIndex).input('endIndex', sql.Int, endIndex).input('limit', sql.Int, MAX_DRUGS)
        .query(`SELECT TOP (@limit) hd.drug_cd, hd.drug_name, SUM(hd.total_sales) AS total_sales FROM V_HOSPITAL_DRUG_MONTHLY_byClaude hd WHERE hd.hos_cd = @hos_cd AND hd.hos_cso_cd = @hos_cso_cd AND hd.sales_index BETWEEN @startIndex AND @endIndex GROUP BY hd.drug_cd, hd.drug_name ORDER BY SUM(hd.total_sales) DESC`),
      pool.request().input('hos_cd', sql.NVarChar, hos_cd).input('hos_cso_cd', sql.NVarChar, hos_cso_cd).input('startIndex', sql.Int, startIndex).input('endIndex', sql.Int, endIndex).input('limit', sql.Int, MAX_DRUGS)
        .query(`SELECT hd.drug_cd, hd.drug_name, hd.sales_index, hd.total_sales FROM V_HOSPITAL_DRUG_MONTHLY_byClaude hd WHERE hd.hos_cd = @hos_cd AND hd.hos_cso_cd = @hos_cso_cd AND hd.sales_index BETWEEN @startIndex AND @endIndex AND hd.drug_cd IN (SELECT TOP (@limit) drug_cd FROM V_HOSPITAL_DRUG_MONTHLY_byClaude WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND sales_index BETWEEN @startIndex AND @endIndex GROUP BY drug_cd ORDER BY SUM(total_sales) DESC) ORDER BY hd.drug_cd, hd.sales_index`),
      pool.request().input('hos_cd', sql.NVarChar, hos_cd).input('hos_cso_cd', sql.NVarChar, hos_cso_cd).input('startIndex', sql.Int, startIndex).input('endIndex', sql.Int, endIndex).input('limit', sql.Int, MAX_CSOS)
        .query(`SELECT TOP (@limit) cso_cd, ISNULL(cso_dealer_nm, '미지정') AS cso_dealer_nm, SUM(total_sales) AS total_sales FROM V_CSO_HOSPITAL_MONTHLY_byClaude WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND sales_index BETWEEN @startIndex AND @endIndex GROUP BY cso_cd, cso_dealer_nm ORDER BY SUM(total_sales) DESC`),
      pool.request().input('hos_cd', sql.NVarChar, hos_cd).input('hos_cso_cd', sql.NVarChar, hos_cso_cd).input('startIndex', sql.Int, startIndex).input('endIndex', sql.Int, endIndex).input('limit', sql.Int, MAX_CSOS)
        .query(`SELECT v.cso_cd, ISNULL(v.cso_dealer_nm, '미지정') AS cso_dealer_nm, v.sales_index, v.total_sales FROM V_CSO_HOSPITAL_MONTHLY_byClaude v WHERE v.hos_cd = @hos_cd AND v.hos_cso_cd = @hos_cso_cd AND v.sales_index BETWEEN @startIndex AND @endIndex AND v.cso_cd IN (SELECT TOP (@limit) cso_cd FROM V_CSO_HOSPITAL_MONTHLY_byClaude WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND sales_index BETWEEN @startIndex AND @endIndex GROUP BY cso_cd ORDER BY SUM(total_sales) DESC) ORDER BY v.cso_cd, v.sales_index`),
      pool.request().input('hos_cd', sql.NVarChar, hos_cd).input('hos_cso_cd', sql.NVarChar, hos_cso_cd).input('startIndex', sql.Int, startIndex).input('endIndex', sql.Int, endIndex)
        .query(`SELECT COUNT(DISTINCT drug_cd) AS drug_count FROM V_HOSPITAL_DRUG_MONTHLY_byClaude WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND sales_index BETWEEN @startIndex AND @endIndex`),
      pool.request().input('hos_cd', sql.NVarChar, hos_cd).input('hos_cso_cd', sql.NVarChar, hos_cso_cd).input('startIndex', sql.Int, startIndex).input('endIndex', sql.Int, endIndex)
        .query(`SELECT COUNT(DISTINCT cso_cd) AS cso_count FROM V_CSO_HOSPITAL_MONTHLY_byClaude WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND sales_index BETWEEN @startIndex AND @endIndex`),
    ]);
  });
  allSteps.push({ label: 'DB: 7개쿼리병렬', elapsed: dbQueryTime });
  console.log(`\nDB 7개 쿼리 (병렬): ${dbQueryTime}ms`);

  // === 5. DB: 블록 조회 ===
  const { elapsed: blockTime } = await timed('블록조회', async () => {
    return await pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .query(`
        SELECT drug_cd, drug_name, cso_cd, cso_dealer_nm, disease_type
        FROM V_CURRENT_BLOCKS_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
        ORDER BY drug_name, cso_dealer_nm
      `);
  });
  allSteps.push({ label: 'DB: 블록조회', elapsed: blockTime });
  console.log(`DB 블록 조회: ${blockTime}ms`);

  // === 6. NaverWorks API: Flex 메시지 (캐러셀) 전송 ===
  // 간단한 더미 캐러셀로 API 응답시간만 측정
  const dummyCarousel = {
    type: 'carousel',
    contents: [{
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '벤치마크 Flex' }] }
    }]
  };

  const { elapsed: flexTime } = await timed('Flex전송', async () => {
    return await axios.post(
      `${API_BASE_URL}/bots/${config.naverWorks.botId}/users/${TEST_USER_ID}/messages`,
      { content: { type: 'flex', altText: '벤치마크', contents: dummyCarousel } },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
  });
  allSteps.push({ label: 'API: Flex캐러셀', elapsed: flexTime });
  console.log(`Flex 캐러셀 전송: ${flexTime}ms`);

  // === 최종 요약 ===
  const totalTime = allSteps.reduce((sum, s) => sum + s.elapsed, 0);
  const dbTotal = allSteps.filter(s => s.label.startsWith('DB')).reduce((sum, s) => sum + s.elapsed, 0);
  const apiTotal = allSteps.filter(s => s.label.startsWith('API')).reduce((sum, s) => sum + s.elapsed, 0);

  console.log('\n========== 최종 요약 ==========');
  allSteps
    .sort((a, b) => b.elapsed - a.elapsed)
    .forEach(s => {
      const bar = '█'.repeat(Math.max(1, Math.ceil(s.elapsed / 200)));
      console.log(`  ${s.label.padEnd(18)} ${String(s.elapsed).padStart(6)}ms ${bar}`);
    });
  console.log('  ─────────────────────────────');
  console.log(`  ${'DB 합계'.padEnd(18)} ${String(dbTotal).padStart(6)}ms`);
  console.log(`  ${'API 합계'.padEnd(18)} ${String(apiTotal).padStart(6)}ms`);
  console.log(`  ${'전체 합계'.padEnd(18)} ${String(totalTime).padStart(6)}ms`);

  await pool.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
