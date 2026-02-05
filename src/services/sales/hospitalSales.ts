/**
 * 병원 상세 매출 조회 서비스 (V2)
 * Depth2 HOSPITAL 조회
 */

import { getConnection } from '../database/connection';
import sql from 'mssql';
import { formatDrugName } from '../../utils/drugNameFormatter';
import { formatSalesMoney } from '../../utils/numberFormatter';
import { COLORS, LOGO_URL, createFooter } from '../../utils/bubbleBuilder';
import { getCurrentPeriod, PeriodInfo } from './periodService';
import {
  encodePostback,
  createHospitalDrugPostback,
  createHospitalCsoPostback,
} from '../../types/postback';
import { createPageToken } from '../token/pageToken';

// 버블당 최대 버튼 수
const MAX_BUTTONS_PER_BUBBLE = 5;
// 최대 품목 수
const MAX_DRUGS = 10;
// 최대 CSO 수
const MAX_CSOS = 10;
// 블록 버블당 최대 라인 수
const MAX_LINES_PER_BLOCK_BUBBLE = 12;
// NaverWorks 캐러셀 최대 버블 수
const MAX_CAROUSEL_BUBBLES = 10;

interface MonthlySalesData {
  sales_year: number;
  sales_month: number;
  sales_index: number;
  total_sales: number;
}

interface DrugSalesData {
  drug_cd: string;
  drug_name: string;
  total_sales: number;
  monthlySales: number[];
}

interface CsoSalesData {
  cso_cd: string;
  cso_dealer_nm: string;
  total_sales: number;
  monthlySales: number[];
}

interface HospitalInfo {
  hos_cd: string;
  hos_cso_cd: string;
  hos_name: string;
  hos_abbr: string | null;
}

// 블록 데이터 인터페이스
interface BlockData {
  drug_cd: string;
  drug_name: string;
  cso_cd: string;
  cso_dealer_nm: string;
  disease_type: string | null;
}

interface CsoBlockInfo {
  cso_dealer_nm: string;
  diseases: string[];
}

interface DrugBlockGroup {
  drug_name: string;
  csoBlocks: CsoBlockInfo[];
}

export interface HospitalSalesResult {
  hospital: HospitalInfo;
  summary: {
    total_sales: number;
    drug_count: number;
    cso_count: number;
  };
  monthlySales: MonthlySalesData[];
  topDrugs: DrugSalesData[];
  topCsos: CsoSalesData[];
  periodMonths: number;
  periodText: string;
}

// Phase 1: 요약 + 블록용 (빠른 첫 응답)
export interface HospitalSummaryResult {
  hospital: HospitalInfo;
  summary: {
    total_sales: number;
    drug_count: number;
  };
  monthlySales: MonthlySalesData[];
  periodMonths: number;
  periodText: string;
  startIndex: number;
  endIndex: number;
}

// Phase 2: 품목 + CSO 상세용
export interface HospitalDetailResult {
  hospital: HospitalInfo;
  topDrugs: DrugSalesData[];
  topCsos: CsoSalesData[];
  periodText: string;
}

/**
 * 병원 상세 매출 조회 (V2)
 * @param hos_cd 병원 코드
 * @param hos_cso_cd 병원 CSO 코드
 * @param period 기간 정보 (선택적)
 */
export async function getHospitalSales(
  hos_cd: string,
  hos_cso_cd: string,
  period?: PeriodInfo
): Promise<HospitalSalesResult | null> {
  const pool = await getConnection();

  // 병원 기본 정보 조회
  const hospitalInfoResult = await pool.request()
    .input('hos_cd', sql.NVarChar, hos_cd)
    .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
    .query(`
      SELECT hos_cd, hos_cso_cd, hos_name, hos_abbr
      FROM HOSPITAL_TBL
      WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
    `);

  if (hospitalInfoResult.recordset.length === 0) {
    return null;
  }

  const hospital = hospitalInfoResult.recordset[0] as HospitalInfo;

  // 기간 정보 (없으면 현재 기간 조회)
  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex, periodText, periodMonths } = periodInfo;

  // 병렬 쿼리 실행 - 7개 → 2개로 통합 (네트워크 왕복 최소화)
  const [drugQueryResult, csoQueryResult] = await Promise.all([
    // 통합 쿼리 1: 월별 매출 + 품목 데이터 (3개 결과셋)
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_DRUGS)
      .query(`
        -- 1. 월별 매출
        SELECT sales_year, sales_month, sales_index, total_sales
        FROM V_HOSPITAL_MONTHLY_SALES_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        ORDER BY sales_index;

        -- 2. TOP 품목별 월별 매출 (총액 포함)
        SELECT hd.drug_cd, hd.drug_name, hd.sales_index, hd.total_sales
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude hd
        WHERE hd.hos_cd = @hos_cd AND hd.hos_cso_cd = @hos_cso_cd
          AND hd.sales_index BETWEEN @startIndex AND @endIndex
          AND hd.drug_cd IN (
            SELECT TOP (@limit) drug_cd
            FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
            WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
              AND sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY drug_cd
            ORDER BY SUM(total_sales) DESC
          )
        ORDER BY hd.drug_cd, hd.sales_index;

        -- 3. 품목 수
        SELECT COUNT(DISTINCT drug_cd) AS drug_count
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex;
      `),

    // 통합 쿼리 2: CSO 데이터 (2개 결과셋) - 집계 테이블 사용
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_CSOS)
      .query(`
        -- 1. TOP CSO별 월별 매출
        SELECT
          v.cso_cd,
          ISNULL(v.cso_dealer_nm, '미지정') AS cso_dealer_nm,
          v.sales_index,
          v.total_sales
        FROM AGG_CSO_HOSPITAL_MONTHLY v
        WHERE v.hos_cd = @hos_cd AND v.hos_cso_cd = @hos_cso_cd
          AND v.sales_index BETWEEN @startIndex AND @endIndex
          AND v.cso_cd IN (
            SELECT TOP (@limit) cso_cd
            FROM AGG_CSO_HOSPITAL_MONTHLY
            WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
              AND sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY cso_cd
            ORDER BY SUM(total_sales) DESC
          )
        ORDER BY v.cso_cd, v.sales_index;

        -- 2. CSO 수
        SELECT COUNT(DISTINCT cso_cd) AS cso_count
        FROM AGG_CSO_HOSPITAL_MONTHLY
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex;
      `)
  ]);

  // 결과셋 분리 (타입 캐스팅)
  const drugRecordsets = drugQueryResult.recordsets as any[];
  const csoRecordsets = csoQueryResult.recordsets as any[];
  const monthlyResult = { recordset: drugRecordsets[0] };
  const drugMonthlyResult = { recordset: drugRecordsets[1] };
  const drugCountResult = { recordset: drugRecordsets[2] };
  const csoMonthlyResult = { recordset: csoRecordsets[0] };
  const csoCountResult = { recordset: csoRecordsets[1] };

  const monthlySales = monthlyResult.recordset as MonthlySalesData[];
  const drugCountData = drugCountResult.recordset[0];
  const csoCountData = csoCountResult.recordset[0];

  // 품목별 월별 매출 데이터 조합 (월별 데이터에서 총액 계산)
  const drugMonthlyData = drugMonthlyResult.recordset as {
    drug_cd: string;
    drug_name: string;
    sales_index: number;
    total_sales: number;
  }[];

  // 품목별로 그룹화하여 총액 계산
  const drugMap = new Map<string, { drug_name: string; total: number; monthly: number[] }>();
  for (const row of drugMonthlyData) {
    if (!drugMap.has(row.drug_cd)) {
      drugMap.set(row.drug_cd, { drug_name: row.drug_name, total: 0, monthly: [] });
    }
    const entry = drugMap.get(row.drug_cd)!;
    entry.total += row.total_sales;
    entry.monthly.push(row.total_sales);
  }

  // 총액 기준 정렬
  const topDrugs: DrugSalesData[] = Array.from(drugMap.entries())
    .map(([drug_cd, data]) => ({
      drug_cd,
      drug_name: data.drug_name,
      total_sales: data.total,
      monthlySales: data.monthly
    }))
    .sort((a, b) => b.total_sales - a.total_sales)
    .slice(0, MAX_DRUGS);

  // CSO별 월별 매출 데이터 조합 (월별 데이터에서 총액 계산)
  const csoMonthlyData = csoMonthlyResult.recordset as {
    cso_cd: string;
    cso_dealer_nm: string;
    sales_index: number;
    total_sales: number;
  }[];

  // CSO별로 그룹화하여 총액 계산
  const csoMap = new Map<string, { cso_dealer_nm: string; total: number; monthly: number[] }>();
  for (const row of csoMonthlyData) {
    if (!csoMap.has(row.cso_cd)) {
      csoMap.set(row.cso_cd, { cso_dealer_nm: row.cso_dealer_nm, total: 0, monthly: [] });
    }
    const entry = csoMap.get(row.cso_cd)!;
    entry.total += row.total_sales;
    entry.monthly.push(row.total_sales);
  }

  // 총액 기준 정렬
  const topCsos: CsoSalesData[] = Array.from(csoMap.entries())
    .map(([cso_cd, data]) => ({
      cso_cd,
      cso_dealer_nm: data.cso_dealer_nm,
      total_sales: data.total,
      monthlySales: data.monthly
    }))
    .sort((a, b) => b.total_sales - a.total_sales)
    .slice(0, MAX_CSOS);

  const totalSales = monthlySales.reduce((sum, m) => sum + m.total_sales, 0);

  return {
    hospital,
    summary: {
      total_sales: totalSales,
      drug_count: drugCountData?.drug_count || 0,
      cso_count: csoCountData?.cso_count || 0
    },
    monthlySales,
    topDrugs,
    topCsos,
    periodMonths,
    periodText
  };
}

/**
 * Phase 1: 병원 요약 정보 조회 (빠른 첫 응답용)
 * - 병원 기본정보, 월별 매출, 품목 수만 조회
 */
export async function getHospitalSummary(
  hos_cd: string,
  hos_cso_cd: string,
  period?: PeriodInfo
): Promise<HospitalSummaryResult | null> {
  const pool = await getConnection();

  // 병원 기본 정보 조회
  const hospitalInfoResult = await pool.request()
    .input('hos_cd', sql.NVarChar, hos_cd)
    .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
    .query(`
      SELECT hos_cd, hos_cso_cd, hos_name, hos_abbr
      FROM HOSPITAL_TBL
      WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
    `);

  if (hospitalInfoResult.recordset.length === 0) {
    return null;
  }

  const hospital = hospitalInfoResult.recordset[0] as HospitalInfo;

  // 기간 정보 (없으면 현재 기간 조회)
  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex, periodText, periodMonths } = periodInfo;

  // 필수 쿼리만 병렬 실행 (집계 테이블 사용)
  const [monthlyResult, drugCountResult] = await Promise.all([
    // 월별 매출 (집계 테이블 사용)
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT sales_year, sales_month, sales_index, total_sales
        FROM V_HOSPITAL_MONTHLY_SALES_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        ORDER BY sales_index
      `),

    // 품목 수 (유니크 품목 수)
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT COUNT(DISTINCT drug_cd) AS drug_count
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
      `)
  ]);

  const monthlySales = monthlyResult.recordset as MonthlySalesData[];
  const drugCountData = drugCountResult.recordset[0];
  const totalSales = monthlySales.reduce((sum, m) => sum + m.total_sales, 0);

  return {
    hospital,
    summary: {
      total_sales: totalSales,
      drug_count: drugCountData?.drug_count || 0
    },
    monthlySales,
    periodMonths,
    periodText,
    startIndex,
    endIndex
  };
}

/**
 * Phase 2: 병원 상세 정보 조회 (품목 + CSO)
 */
export async function getHospitalDetails(
  hos_cd: string,
  hos_cso_cd: string,
  startIndex: number,
  endIndex: number,
  periodText: string
): Promise<HospitalDetailResult | null> {
  const pool = await getConnection();

  // 병원 기본 정보 조회
  const hospitalInfoResult = await pool.request()
    .input('hos_cd', sql.NVarChar, hos_cd)
    .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
    .query(`
      SELECT hos_cd, hos_cso_cd, hos_name, hos_abbr
      FROM HOSPITAL_TBL
      WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
    `);

  if (hospitalInfoResult.recordset.length === 0) {
    return null;
  }

  const hospital = hospitalInfoResult.recordset[0] as HospitalInfo;

  // 품목 + CSO 쿼리 병렬 실행 (4개 → 2개 통합)
  const [drugQueryResult, csoQueryResult] = await Promise.all([
    // 통합 쿼리 1: TOP 품목별 월별 매출
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_DRUGS)
      .query(`
        SELECT hd.drug_cd, hd.drug_name, hd.sales_index, hd.total_sales
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude hd
        WHERE hd.hos_cd = @hos_cd AND hd.hos_cso_cd = @hos_cso_cd
          AND hd.sales_index BETWEEN @startIndex AND @endIndex
          AND hd.drug_cd IN (
            SELECT TOP (@limit) drug_cd
            FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
            WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
              AND sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY drug_cd
            ORDER BY SUM(total_sales) DESC
          )
        ORDER BY hd.drug_cd, hd.sales_index
      `),

    // 통합 쿼리 2: TOP CSO별 월별 매출 - 집계 테이블 사용
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_CSOS)
      .query(`
        SELECT
          v.cso_cd,
          ISNULL(v.cso_dealer_nm, '미지정') AS cso_dealer_nm,
          v.sales_index,
          v.total_sales
        FROM AGG_CSO_HOSPITAL_MONTHLY v
        WHERE v.hos_cd = @hos_cd AND v.hos_cso_cd = @hos_cso_cd
          AND v.sales_index BETWEEN @startIndex AND @endIndex
          AND v.cso_cd IN (
            SELECT TOP (@limit) cso_cd
            FROM AGG_CSO_HOSPITAL_MONTHLY
            WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
              AND sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY cso_cd
            ORDER BY SUM(total_sales) DESC
          )
        ORDER BY v.cso_cd, v.sales_index
      `)
  ]);

  // 품목별 월별 매출 데이터 조합
  const drugMonthlyData = drugQueryResult.recordset as {
    drug_cd: string;
    drug_name: string;
    sales_index: number;
    total_sales: number;
  }[];

  // 품목별로 그룹화하여 총액 계산
  const drugMap = new Map<string, { drug_name: string; total: number; monthly: number[] }>();
  for (const row of drugMonthlyData) {
    if (!drugMap.has(row.drug_cd)) {
      drugMap.set(row.drug_cd, { drug_name: row.drug_name, total: 0, monthly: [] });
    }
    const entry = drugMap.get(row.drug_cd)!;
    entry.total += row.total_sales;
    entry.monthly.push(row.total_sales);
  }

  const topDrugs: DrugSalesData[] = Array.from(drugMap.entries())
    .map(([drug_cd, data]) => ({
      drug_cd,
      drug_name: data.drug_name,
      total_sales: data.total,
      monthlySales: data.monthly
    }))
    .sort((a, b) => b.total_sales - a.total_sales)
    .slice(0, MAX_DRUGS);

  // CSO별 월별 매출 데이터 조합
  const csoMonthlyData = csoQueryResult.recordset as {
    cso_cd: string;
    cso_dealer_nm: string;
    sales_index: number;
    total_sales: number;
  }[];

  // CSO별로 그룹화하여 총액 계산
  const csoMap = new Map<string, { cso_dealer_nm: string; total: number; monthly: number[] }>();
  for (const row of csoMonthlyData) {
    if (!csoMap.has(row.cso_cd)) {
      csoMap.set(row.cso_cd, { cso_dealer_nm: row.cso_dealer_nm, total: 0, monthly: [] });
    }
    const entry = csoMap.get(row.cso_cd)!;
    entry.total += row.total_sales;
    entry.monthly.push(row.total_sales);
  }

  const topCsos: CsoSalesData[] = Array.from(csoMap.entries())
    .map(([cso_cd, data]) => ({
      cso_cd,
      cso_dealer_nm: data.cso_dealer_nm,
      total_sales: data.total,
      monthlySales: data.monthly
    }))
    .sort((a, b) => b.total_sales - a.total_sales)
    .slice(0, MAX_CSOS);

  return {
    hospital,
    topDrugs,
    topCsos,
    periodText
  };
}

/**
 * HOSPITAL Depth2 캐러셀 생성 (V2)
 * - 요약 버블
 * - 주요품목별 매출 버블 (최대 2개, 버블당 5개 버튼)
 * - 주요CSO별 매출 버블 (최대 2개)
 * @param result 병원 매출 결과
 * @param options 추가 옵션 (isSuperAdmin, userId)
 */
export async function createHospitalCarousel(
  result: HospitalSalesResult,
  options?: { isSuperAdmin?: boolean; userId?: string }
): Promise<any[]> {
  const { hospital, summary, monthlySales, topDrugs, topCsos, periodMonths, periodText } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
  const trendText = monthlySales.map(m => formatSalesMoney(m.total_sales)).join(' > ');

  const hospitalTitle = hospital.hos_abbr || hospital.hos_name;

  const bubbles: any[] = [];

  // SUPER_ADMIN인 경우 블록 수정 URL 생성
  let blockEditUrl: string | null = null;
  let tokenExpiresAt: Date | null = null;
  if (options?.isSuperAdmin && options?.userId) {
    const { uuid, token, expiresAt } = await createPageToken(
      hospital.hos_cd,
      hospital.hos_cso_cd,
      options.userId,
      60 // 60분 유효
    );
    const baseUrl = process.env.APP_URL || 'https://ajubio-newbot2026-86048170240.asia-northeast3.run.app';
    blockEditUrl = `${baseUrl}/blocks?uuid=${uuid}&token=${token}`;
    tokenExpiresAt = expiresAt;
  }

  // 1. 요약 버블
  bubbles.push(createSummaryBubble(hospital, hospitalTitle, summary, monthlyAvg, trendText, periodText, blockEditUrl, tokenExpiresAt));

  // 2. 블록현황 버블들
  const blocks = await getHospitalBlocks(hospital.hos_cd, hospital.hos_cso_cd);
  if (blocks.length > 0) {
    const blockBubbles = createBlockBubbles(hospitalTitle, blocks);
    bubbles.push(...blockBubbles);
  }

  // 3. 주요품목별 매출 버블들 (버블당 5개 버튼, 최대 2개 버블)
  if (topDrugs.length > 0) {
    const drugBubbles = createDrugBubbles(hospital.hos_cd, hospital.hos_cso_cd, topDrugs, periodText, hospitalTitle);
    bubbles.push(...drugBubbles);
  }

  // 4. 주요CSO별 매출 버블들 (버블당 5개 버튼, 최대 2개 버블)
  if (topCsos.length > 0) {
    const csoBubbles = createCsoBubbles(hospital.hos_cd, hospital.hos_cso_cd, topCsos, periodText, hospitalTitle);
    bubbles.push(...csoBubbles);
  }

  // NaverWorks 캐러셀 10개 제한: 초과 시 여러 캐러셀로 분할
  const carousels: any[] = [];
  for (let i = 0; i < bubbles.length; i += MAX_CAROUSEL_BUBBLES) {
    carousels.push({
      type: 'carousel',
      contents: bubbles.slice(i, i + MAX_CAROUSEL_BUBBLES)
    });
  }

  return carousels;
}

/**
 * 요약 버블 생성
 */
function createSummaryBubble(
  _hospital: HospitalInfo,
  hospitalTitle: string,
  summary: HospitalSalesResult['summary'],
  monthlyAvg: number,
  trendText: string,
  periodText: string,
  blockEditUrl?: string | null,
  tokenExpiresAt?: Date | null
): any {
  // 바디 콘텐츠 생성
  const bodyContents: any[] = [
    { type: 'image', url: LOGO_URL, aspectRatio: '5:3', size: 'sm', aspectMode: 'fit' },
    {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: hospitalTitle, size: 'md', color: COLORS.text, weight: 'bold', align: 'center', wrap: true },
        { type: 'text', text: `조회기간: ${periodText}`, size: 'xs', color: COLORS.lightGray, align: 'center', margin: 'sm' },
        { type: 'separator', margin: 'md', color: COLORS.border },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '월평균 매출', size: 'sm', color: COLORS.subtext },
            { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
          ],
          margin: 'md'
        },
        { type: 'text', text: `(${trendText})`, size: 'xxs', color: COLORS.subtext, align: 'end', margin: 'sm' },
        { type: 'separator', margin: 'md', color: COLORS.border },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '거래 품목', size: 'sm', color: COLORS.subtext },
            { type: 'text', text: `${summary.drug_count}개`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
          ],
          margin: 'md'
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '거래 CSO', size: 'sm', color: COLORS.subtext },
            { type: 'text', text: `${summary.cso_count}명`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
          ],
          margin: 'sm'
        }
      ],
      backgroundColor: COLORS.white,
      cornerRadius: '12px',
      paddingAll: '16px',
      margin: 'md'
    }
  ];

  // SUPER_ADMIN인 경우 블록 수정 섹션 추가 (바디에 흰색 둥근 상자)
  if (blockEditUrl) {
    // 토큰 만료 시간을 MM.DD HH:mm 형식으로 포맷팅
    const expiresText = tokenExpiresAt
      ? `변경 가능 시간 ~ ${String(tokenExpiresAt.getMonth() + 1).padStart(2, '0')}.${String(tokenExpiresAt.getDate()).padStart(2, '0')} ${String(tokenExpiresAt.getHours()).padStart(2, '0')}:${String(tokenExpiresAt.getMinutes()).padStart(2, '0')}`
      : '블록 수정';
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: expiresText,
          size: 'xs',
          color: COLORS.lightGray,
          align: 'center',
          wrap: true
        },
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '블록 수정',
            uri: blockEditUrl,
          },
          style: 'primary',
          height: 'sm',
          color: COLORS.navy,
          margin: 'sm'
        }
      ],
      backgroundColor: COLORS.white,
      cornerRadius: '12px',
      paddingAll: '12px',
      margin: 'md'
    });
  }

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: hospitalTitle, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '8px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      backgroundColor: COLORS.background,
      paddingAll: '12px'
    },
    footer: createFooter()
  };
}

/**
 * 주요품목별 매출 버블들 생성
 */
function createDrugBubbles(hos_cd: string, hos_cso_cd: string, drugs: DrugSalesData[], periodText: string, hospitalTitle: string): any[] {
  const bubbles: any[] = [];
  const totalBubbles = Math.ceil(drugs.length / MAX_BUTTONS_PER_BUBBLE);

  for (let i = 0; i < drugs.length; i += MAX_BUTTONS_PER_BUBBLE) {
    const chunk = drugs.slice(i, i + MAX_BUTTONS_PER_BUBBLE);
    const bubbleIndex = Math.floor(i / MAX_BUTTONS_PER_BUBBLE) + 1;

    const title = totalBubbles > 1
      ? `주요 품목 (${bubbleIndex}/${totalBubbles})`
      : '주요 품목';

    const buttons = chunk.map((drug, index) => {
      const label = formatDrugName(drug.drug_name);
      const displayLabel = label.length > 15 ? label.slice(0, 13) + '..' : label;
      const postback = createHospitalDrugPostback(hos_cd, hos_cso_cd, drug.drug_cd);

      return {
        type: 'button',
        action: {
          type: 'postback',
          label: displayLabel,
          data: encodePostback(postback),
        },
        style: 'secondary',  // 검정 글씨
        height: 'sm',
        color: index % 2 === 0 ? COLORS.buttonAlt : COLORS.lightBlue,
        margin: 'sm',
      };
    });

    // 품목 정보 행
    const drugInfoRows = chunk.map(drug => {
      const trendText = drug.monthlySales.length > 0
        ? drug.monthlySales.map(s => formatSalesMoney(s)).join(' > ')
        : '';
      const monthlyAvg = drug.monthlySales.length > 0
        ? drug.monthlySales.reduce((a, b) => a + b, 0) / drug.monthlySales.length
        : drug.total_sales / 3;

      return {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: formatDrugName(drug.drug_name), size: 'xs', color: COLORS.text, flex: 3, wrap: true },
              { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'xs', weight: 'bold', color: COLORS.navy, align: 'end', flex: 2 }
            ]
          },
          { type: 'text', text: `(${trendText})`, size: 'xxs', color: COLORS.lightGray, margin: 'xs' }
        ],
        margin: 'md'
      };
    });

    bubbles.push({
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: hospitalTitle, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }],
        backgroundColor: COLORS.darkNavy,
        paddingAll: '8px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: title, size: 'md', color: COLORS.text, weight: 'bold', align: 'center' },
              { type: 'text', text: periodText, size: 'xxs', color: COLORS.lightGray, align: 'center', margin: 'xs' },
              { type: 'separator', margin: 'md', color: COLORS.border },
              ...drugInfoRows,
              { type: 'separator', margin: 'md', color: COLORS.border },
              { type: 'box', layout: 'vertical', contents: buttons, margin: 'md' }
            ],
            backgroundColor: COLORS.white,
            cornerRadius: '12px',
            paddingAll: '16px'
          }
        ],
        backgroundColor: COLORS.background,
        paddingAll: '12px'
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: 'AJUBIO', size: 'xxs', weight: 'bold', color: COLORS.white, align: 'center' }],
        backgroundColor: COLORS.darkNavy,
        paddingAll: '6px'
      }
    });
  }

  return bubbles;
}

/**
 * 주요CSO별 매출 버블들 생성
 */
function createCsoBubbles(hos_cd: string, hos_cso_cd: string, csos: CsoSalesData[], periodText: string, hospitalTitle: string): any[] {
  const bubbles: any[] = [];
  const totalBubbles = Math.ceil(csos.length / MAX_BUTTONS_PER_BUBBLE);

  for (let i = 0; i < csos.length; i += MAX_BUTTONS_PER_BUBBLE) {
    const chunk = csos.slice(i, i + MAX_BUTTONS_PER_BUBBLE);
    const bubbleIndex = Math.floor(i / MAX_BUTTONS_PER_BUBBLE) + 1;

    const title = totalBubbles > 1
      ? `주요 CSO (${bubbleIndex}/${totalBubbles})`
      : '주요 CSO';

    const buttons = chunk.map((cso, index) => {
      const label = cso.cso_dealer_nm;
      const displayLabel = label.length > 15 ? label.slice(0, 13) + '..' : label;
      const postback = createHospitalCsoPostback(hos_cd, hos_cso_cd, cso.cso_cd);

      return {
        type: 'button',
        action: {
          type: 'postback',
          label: displayLabel,
          data: encodePostback(postback),
        },
        style: 'secondary',  // 검정 글씨
        height: 'sm',
        color: index % 2 === 0 ? COLORS.buttonAlt : COLORS.lightBlue,
        margin: 'sm',
      };
    });

    // CSO 정보 행
    const csoInfoRows = chunk.map(cso => {
      const trendText = cso.monthlySales.length > 0
        ? cso.monthlySales.map(s => formatSalesMoney(s)).join(' > ')
        : '';
      const monthlyAvg = cso.monthlySales.length > 0
        ? cso.monthlySales.reduce((a, b) => a + b, 0) / cso.monthlySales.length
        : cso.total_sales / 3;

      return {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: cso.cso_dealer_nm, size: 'xs', color: COLORS.text, flex: 3, wrap: true },
              { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'xs', weight: 'bold', color: COLORS.navy, align: 'end', flex: 2 }
            ]
          },
          { type: 'text', text: `(${trendText})`, size: 'xxs', color: COLORS.lightGray, margin: 'xs' }
        ],
        margin: 'md'
      };
    });

    bubbles.push({
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: hospitalTitle, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }],
        backgroundColor: COLORS.darkNavy,
        paddingAll: '8px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: title, size: 'md', color: COLORS.text, weight: 'bold', align: 'center' },
              { type: 'text', text: periodText, size: 'xxs', color: COLORS.lightGray, align: 'center', margin: 'xs' },
              { type: 'separator', margin: 'md', color: COLORS.border },
              ...csoInfoRows,
              { type: 'separator', margin: 'md', color: COLORS.border },
              { type: 'box', layout: 'vertical', contents: buttons, margin: 'md' }
            ],
            backgroundColor: COLORS.white,
            cornerRadius: '12px',
            paddingAll: '16px'
          }
        ],
        backgroundColor: COLORS.background,
        paddingAll: '12px'
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: 'AJUBIO', size: 'xxs', weight: 'bold', color: COLORS.white, align: 'center' }],
        backgroundColor: COLORS.darkNavy,
        paddingAll: '6px'
      }
    });
  }

  return bubbles;
}

/**
 * 병원의 현재 블록 정보 조회
 */
async function getHospitalBlocks(
  hos_cd: string,
  hos_cso_cd: string
): Promise<DrugBlockGroup[]> {
  const pool = await getConnection();

  const result = await pool.request()
    .input('hos_cd', sql.NVarChar, hos_cd)
    .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
    .query(`
      SELECT drug_cd, drug_name, cso_cd, cso_dealer_nm, disease_type
      FROM V_CURRENT_BLOCKS_byClaude
      WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
      ORDER BY drug_name, cso_dealer_nm
    `);

  const rows = result.recordset as BlockData[];

  // 품목별 그룹화
  const drugMap = new Map<string, DrugBlockGroup>();

  for (const row of rows) {
    if (!drugMap.has(row.drug_cd)) {
      drugMap.set(row.drug_cd, {
        drug_name: formatDrugName(row.drug_name),
        csoBlocks: []
      });
    }

    const group = drugMap.get(row.drug_cd)!;
    const existingCso = group.csoBlocks.find(c => c.cso_dealer_nm === row.cso_dealer_nm);

    if (existingCso) {
      if (row.disease_type && !existingCso.diseases.includes(row.disease_type)) {
        existingCso.diseases.push(row.disease_type);
      }
    } else {
      group.csoBlocks.push({
        cso_dealer_nm: row.cso_dealer_nm,
        diseases: row.disease_type ? [row.disease_type] : []
      });
    }
  }

  return Array.from(drugMap.values());
}

/**
 * 블록현황 버블들 생성
 * 라인이 많으면 버블 2개로 분할
 */
function createBlockBubbles(
  hospitalTitle: string,
  blocks: DrugBlockGroup[]
): any[] {
  if (blocks.length === 0) {
    return [];
  }

  const bubbles: any[] = [];
  let currentContents: any[] = [];
  let lineCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const drug = blocks[i];

    // 품목명 라인
    const drugNameLine = {
      type: 'text',
      text: drug.drug_name,
      size: 'sm',
      color: COLORS.text,
      weight: 'bold',
      margin: currentContents.length === 0 ? 'none' : 'lg',
    };

    // CSO별 라인들
    const csoLines = drug.csoBlocks.map((cso, idx) => {
      const diseaseText = cso.diseases.length > 0
        ? cso.diseases.join(', ')
        : '';
      const text = diseaseText
        ? `${cso.cso_dealer_nm}- ${diseaseText}`
        : cso.cso_dealer_nm;

      return {
        type: 'text',
        text: text,
        size: 'xs',
        color: COLORS.subtext,
        margin: idx === 0 ? 'sm' : 'xs',
        wrap: true,
      };
    });

    // 라인 수 체크 (품목명 1줄 + CSO 줄들)
    const newLineCount = 1 + csoLines.length;

    // 버블이 꽉 찼으면 새 버블 시작
    if (lineCount + newLineCount > MAX_LINES_PER_BLOCK_BUBBLE && currentContents.length > 0) {
      bubbles.push(createSingleBlockBubble(hospitalTitle, currentContents, bubbles.length + 1));
      currentContents = [];
      lineCount = 0;
    }

    currentContents.push(drugNameLine, ...csoLines);

    // 품목 간 구분선 (마지막이 아닌 경우)
    if (i < blocks.length - 1) {
      currentContents.push({
        type: 'separator',
        margin: 'lg',
        color: COLORS.border,
      });
      lineCount += 1;
    }

    lineCount += newLineCount;
  }

  // 남은 콘텐츠로 마지막 버블 생성
  if (currentContents.length > 0) {
    bubbles.push(createSingleBlockBubble(hospitalTitle, currentContents, bubbles.length + 1));
  }

  // 버블이 2개 이상이면 번호 업데이트
  if (bubbles.length > 1) {
    bubbles.forEach((bubble, idx) => {
      bubble.header.contents[0].text = `블록현황 (${idx + 1}/${bubbles.length})`;
    });
  }

  return bubbles;
}

/**
 * 단일 블록현황 버블 생성
 */
function createSingleBlockBubble(
  hospitalTitle: string,
  contents: any[],
  _index: number
): any {
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '블록현황',
          size: 'sm',
          weight: 'bold',
          color: COLORS.white,
          align: 'center',
        },
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '8px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'image', url: LOGO_URL, aspectRatio: '5:3', size: 'sm', aspectMode: 'fit' },
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: hospitalTitle,
              size: 'md',
              color: COLORS.text,
              weight: 'bold',
              align: 'center',
              wrap: true,
            },
            {
              type: 'separator',
              margin: 'md',
              color: COLORS.border,
            },
            ...contents,
          ],
          backgroundColor: COLORS.white,
          cornerRadius: '12px',
          paddingAll: '16px',
          margin: 'md',
        },
      ],
      backgroundColor: COLORS.background,
      paddingAll: '12px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          size: 'xxs',
          weight: 'bold',
          color: COLORS.white,
          align: 'center',
        },
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '6px',
    },
  };
}

/**
 * Phase 1: 요약 + 블록 캐러셀 생성 (빠른 첫 응답)
 */
export async function createSummaryCarousel(
  result: HospitalSummaryResult,
  options?: { isSuperAdmin?: boolean; userId?: string }
): Promise<any> {
  const { hospital, summary, monthlySales, periodMonths, periodText } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
  const trendText = monthlySales.map(m => formatSalesMoney(m.total_sales)).join(' > ');

  const hospitalTitle = hospital.hos_abbr || hospital.hos_name;

  const bubbles: any[] = [];

  // SUPER_ADMIN인 경우 블록 수정 URL 생성
  let blockEditUrl: string | null = null;
  let tokenExpiresAt: Date | null = null;
  if (options?.isSuperAdmin && options?.userId) {
    const { uuid, token, expiresAt } = await createPageToken(
      hospital.hos_cd,
      hospital.hos_cso_cd,
      options.userId,
      60 // 60분 유효
    );
    const baseUrl = process.env.APP_URL || 'https://ajubio-newbot2026-86048170240.asia-northeast3.run.app';
    blockEditUrl = `${baseUrl}/blocks?uuid=${uuid}&token=${token}`;
    tokenExpiresAt = expiresAt;
  }

  // 1. 요약 버블 (cso_count 없이)
  bubbles.push(createSummaryBubbleV2(hospital, hospitalTitle, summary, monthlyAvg, trendText, periodText, blockEditUrl, tokenExpiresAt));

  // 2. 블록현황 버블들
  const blocks = await getHospitalBlocks(hospital.hos_cd, hospital.hos_cso_cd);
  if (blocks.length > 0) {
    const blockBubbles = createBlockBubbles(hospitalTitle, blocks);
    bubbles.push(...blockBubbles);
  }

  return {
    type: 'carousel',
    contents: bubbles
  };
}

/**
 * Phase 2: 품목 + CSO 캐러셀 생성
 */
export function createDetailCarousel(result: HospitalDetailResult): any[] {
  const { hospital, topDrugs, topCsos, periodText } = result;
  const hospitalTitle = hospital.hos_abbr || hospital.hos_name;

  const bubbles: any[] = [];

  // 1. 주요품목별 매출 버블들
  if (topDrugs.length > 0) {
    const drugBubbles = createDrugBubbles(hospital.hos_cd, hospital.hos_cso_cd, topDrugs, periodText, hospitalTitle);
    bubbles.push(...drugBubbles);
  }

  // 2. 주요CSO별 매출 버블들
  if (topCsos.length > 0) {
    const csoBubbles = createCsoBubbles(hospital.hos_cd, hospital.hos_cso_cd, topCsos, periodText, hospitalTitle);
    bubbles.push(...csoBubbles);
  }

  if (bubbles.length === 0) {
    return [];
  }

  // NaverWorks 캐러셀 10개 제한: 초과 시 여러 캐러셀로 분할
  const carousels: any[] = [];
  for (let i = 0; i < bubbles.length; i += MAX_CAROUSEL_BUBBLES) {
    carousels.push({
      type: 'carousel',
      contents: bubbles.slice(i, i + MAX_CAROUSEL_BUBBLES)
    });
  }

  return carousels;
}

/**
 * 요약 버블 생성 V2 (cso_count 없는 버전)
 */
function createSummaryBubbleV2(
  _hospital: HospitalInfo,
  hospitalTitle: string,
  summary: { total_sales: number; drug_count: number },
  monthlyAvg: number,
  trendText: string,
  periodText: string,
  blockEditUrl?: string | null,
  tokenExpiresAt?: Date | null
): any {
  // 바디 콘텐츠 생성
  const bodyContents: any[] = [
    { type: 'image', url: LOGO_URL, aspectRatio: '5:3', size: 'sm', aspectMode: 'fit' },
    {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: hospitalTitle, size: 'md', color: COLORS.text, weight: 'bold', align: 'center', wrap: true },
        { type: 'text', text: `조회기간: ${periodText}`, size: 'xs', color: COLORS.lightGray, align: 'center', margin: 'sm' },
        { type: 'separator', margin: 'md', color: COLORS.border },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '월평균 매출', size: 'sm', color: COLORS.subtext },
            { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
          ],
          margin: 'md'
        },
        { type: 'text', text: `(${trendText})`, size: 'xxs', color: COLORS.subtext, align: 'end', margin: 'sm' },
        { type: 'separator', margin: 'md', color: COLORS.border },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '거래 품목', size: 'sm', color: COLORS.subtext },
            { type: 'text', text: `${summary.drug_count}개`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
          ],
          margin: 'md'
        }
      ],
      backgroundColor: COLORS.white,
      cornerRadius: '12px',
      paddingAll: '16px',
      margin: 'md'
    }
  ];

  // SUPER_ADMIN인 경우 블록 수정 섹션 추가
  if (blockEditUrl) {
    const expiresText = tokenExpiresAt
      ? `변경 가능 시간 ~ ${String(tokenExpiresAt.getMonth() + 1).padStart(2, '0')}.${String(tokenExpiresAt.getDate()).padStart(2, '0')} ${String(tokenExpiresAt.getHours()).padStart(2, '0')}:${String(tokenExpiresAt.getMinutes()).padStart(2, '0')}`
      : '블록 수정';
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: expiresText,
          size: 'xs',
          color: COLORS.lightGray,
          align: 'center',
          wrap: true
        },
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '블록 수정',
            uri: blockEditUrl,
          },
          style: 'primary',
          height: 'sm',
          color: COLORS.navy,
          margin: 'sm'
        }
      ],
      backgroundColor: COLORS.white,
      cornerRadius: '12px',
      paddingAll: '12px',
      margin: 'md'
    });
  }

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: hospitalTitle, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '8px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      backgroundColor: COLORS.background,
      paddingAll: '12px'
    },
    footer: createFooter()
  };
}
