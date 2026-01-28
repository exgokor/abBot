/**
 * Depth3 복합 조회 서비스
 * 두 엔티티의 조합 매출 조회
 */

import { getConnection } from '../database/connection';
import sql from 'mssql';
import { formatDrugName } from '../../utils/drugNameFormatter';
import { formatSalesMoney } from '../../utils/numberFormatter';
import { COLORS, LOGO_URL, createFooter } from '../../utils/bubbleBuilder';
import { getCurrentPeriod, PeriodInfo } from './periodService';
import { encodePostback } from '../../types/postback';

interface MonthlySalesData {
  sales_year: number;
  sales_month: number;
  sales_index: number;
  total_sales: number;
}

interface CompositeResult {
  title: string;
  subtitle: string;
  summary: {
    total_sales: number;
  };
  monthlySales: MonthlySalesData[];
  periodMonths: number;
  periodText: string;
}

// 세번째 차원 항목 인터페이스
interface ThirdDimensionItem {
  code: string;
  name: string;
  total_sales: number;
}

// 확장된 복합 조회 결과 인터페이스
export interface ExtendedCompositeResult extends CompositeResult {
  thirdDimension?: {
    type: 'DRUG' | 'CSO' | 'HOSPITAL';
    items: ThirdDimensionItem[];
    total_count: number;
  };
  involvedEntities: {
    hospital?: { hos_cd: string; hos_cso_cd: string; name: string };
    cso?: { cso_cd: string; name: string };
    drug?: { drug_cd: string; name: string };
  };
}

/**
 * CSO + HOSPITAL 복합 조회 (CSO 내 특정 병원 매출)
 */
export async function getCsoHospitalSales(
  cso_cd: string,
  hos_cd: string,
  hos_cso_cd: string,
  period?: PeriodInfo
): Promise<CompositeResult | null> {
  const pool = await getConnection();
  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex, periodText, periodMonths } = periodInfo;

  // 기본 정보 조회
  const [csoInfo, hospitalInfo, monthlySales] = await Promise.all([
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .query(`SELECT cso_dealer_nm FROM CSO_TBL WHERE cso_cd = @cso_cd AND cso_is_valid = 'Y'`),
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .query(`SELECT hos_name, hos_abbr FROM HOSPITAL_TBL WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd`),
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT sales_year, sales_month, sales_index, SUM(total_sales) AS total_sales
        FROM V_CSO_HOSPITAL_MONTHLY_byClaude
        WHERE cso_cd = @cso_cd AND hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY sales_year, sales_month, sales_index
        ORDER BY sales_index
      `)
  ]);

  if (csoInfo.recordset.length === 0 || hospitalInfo.recordset.length === 0) {
    return null;
  }

  const csoName = csoInfo.recordset[0].cso_dealer_nm;
  const hospitalName = hospitalInfo.recordset[0].hos_abbr || hospitalInfo.recordset[0].hos_name;
  const monthlyData = monthlySales.recordset as MonthlySalesData[];
  const totalSales = monthlyData.reduce((sum, m) => sum + m.total_sales, 0);

  return {
    title: `${hospitalName}-${csoName}`,
    subtitle: 'CSO-병원 매출',
    summary: { total_sales: totalSales },
    monthlySales: monthlyData,
    periodMonths,
    periodText
  };
}

/**
 * CSO + DRUG 복합 조회 (CSO 내 특정 품목 매출)
 */
export async function getCsoDrugSales(
  cso_cd: string,
  drug_cd: string,
  period?: PeriodInfo
): Promise<CompositeResult | null> {
  const pool = await getConnection();
  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex, periodText, periodMonths } = periodInfo;

  const [csoInfo, drugInfo, monthlySales] = await Promise.all([
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .query(`SELECT cso_dealer_nm FROM CSO_TBL WHERE cso_cd = @cso_cd AND cso_is_valid = 'Y'`),
    pool.request()
      .input('drug_cd', sql.NVarChar, drug_cd)
      .query(`SELECT drug_name FROM DRUG_TBL WHERE drug_cd = @drug_cd AND drug_isvalid = 'Y'`),
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT sales_year, sales_month, sales_index, SUM(total_sales) AS total_sales
        FROM V_CSO_DRUG_MONTHLY_byClaude
        WHERE cso_cd = @cso_cd AND drug_cd = @drug_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY sales_year, sales_month, sales_index
        ORDER BY sales_index
      `)
  ]);

  if (csoInfo.recordset.length === 0 || drugInfo.recordset.length === 0) {
    return null;
  }

  const csoName = csoInfo.recordset[0].cso_dealer_nm;
  const drugName = formatDrugName(drugInfo.recordset[0].drug_name);
  const monthlyData = monthlySales.recordset as MonthlySalesData[];
  const totalSales = monthlyData.reduce((sum, m) => sum + m.total_sales, 0);

  return {
    title: `${csoName}-${drugName}`,
    subtitle: 'CSO-품목 매출',
    summary: { total_sales: totalSales },
    monthlySales: monthlyData,
    periodMonths,
    periodText
  };
}

/**
 * HOSPITAL + DRUG 복합 조회 (병원 내 특정 품목 매출)
 */
export async function getHospitalDrugSales(
  hos_cd: string,
  hos_cso_cd: string,
  drug_cd: string,
  period?: PeriodInfo
): Promise<CompositeResult | null> {
  const pool = await getConnection();
  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex, periodText, periodMonths } = periodInfo;

  const [hospitalInfo, drugInfo, monthlySales] = await Promise.all([
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .query(`SELECT hos_name, hos_abbr FROM HOSPITAL_TBL WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd`),
    pool.request()
      .input('drug_cd', sql.NVarChar, drug_cd)
      .query(`SELECT drug_name FROM DRUG_TBL WHERE drug_cd = @drug_cd AND drug_isvalid = 'Y'`),
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT sales_year, sales_month, sales_index, SUM(total_sales) AS total_sales
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND drug_cd = @drug_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY sales_year, sales_month, sales_index
        ORDER BY sales_index
      `)
  ]);

  if (hospitalInfo.recordset.length === 0 || drugInfo.recordset.length === 0) {
    return null;
  }

  const hospitalName = hospitalInfo.recordset[0].hos_abbr || hospitalInfo.recordset[0].hos_name;
  const drugName = formatDrugName(drugInfo.recordset[0].drug_name);
  const monthlyData = monthlySales.recordset as MonthlySalesData[];
  const totalSales = monthlyData.reduce((sum, m) => sum + m.total_sales, 0);

  return {
    title: `${hospitalName}-${drugName}`,
    subtitle: '병원-품목 매출',
    summary: { total_sales: totalSales },
    monthlySales: monthlyData,
    periodMonths,
    periodText
  };
}

/**
 * HOSPITAL + CSO 복합 조회 (병원 내 특정 CSO 매출)
 */
export async function getHospitalCsoSales(
  hos_cd: string,
  hos_cso_cd: string,
  cso_cd: string,
  period?: PeriodInfo
): Promise<CompositeResult | null> {
  const pool = await getConnection();
  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex, periodText, periodMonths } = periodInfo;

  const [hospitalInfo, csoInfo, monthlySales] = await Promise.all([
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .query(`SELECT hos_name, hos_abbr FROM HOSPITAL_TBL WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd`),
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .query(`SELECT cso_dealer_nm FROM CSO_TBL WHERE cso_cd = @cso_cd AND cso_is_valid = 'Y'`),
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT
          (sales_index / 12 + 2000) AS sales_year,
          (sales_index % 12 + 1) AS sales_month,
          sales_index,
          SUM(drug_cnt * drug_price) AS total_sales
        FROM SALES_TBL
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd AND cso_cd_then = @cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY sales_index
        ORDER BY sales_index
      `)
  ]);

  if (hospitalInfo.recordset.length === 0 || csoInfo.recordset.length === 0) {
    return null;
  }

  const hospitalName = hospitalInfo.recordset[0].hos_abbr || hospitalInfo.recordset[0].hos_name;
  const csoName = csoInfo.recordset[0].cso_dealer_nm;
  const monthlyData = monthlySales.recordset as MonthlySalesData[];
  const totalSales = monthlyData.reduce((sum, m) => sum + m.total_sales, 0);

  return {
    title: `${hospitalName}-${csoName}`,
    subtitle: '병원-CSO 매출',
    summary: { total_sales: totalSales },
    monthlySales: monthlyData,
    periodMonths,
    periodText
  };
}

/**
 * DRUG + HOSPITAL 복합 조회 (품목 내 특정 병원 매출)
 */
export async function getDrugHospitalSales(
  drug_cd: string,
  hos_cd: string,
  hos_cso_cd: string,
  period?: PeriodInfo
): Promise<CompositeResult | null> {
  // 실제로는 HOSPITAL + DRUG와 동일한 데이터
  return getHospitalDrugSales(hos_cd, hos_cso_cd, drug_cd, period);
}

/**
 * DRUG + CSO 복합 조회 (품목 내 특정 CSO 매출)
 */
export async function getDrugCsoSales(
  drug_cd: string,
  cso_cd: string,
  period?: PeriodInfo
): Promise<CompositeResult | null> {
  // 실제로는 CSO + DRUG와 동일한 데이터
  return getCsoDrugSales(cso_cd, drug_cd, period);
}

// ========== 세번째 차원 조회 함수들 ==========

/**
 * 병원+CSO 조합의 품목 목록 조회
 */
async function getHospitalCsoDrugs(
  hos_cd: string,
  hos_cso_cd: string,
  cso_cd: string,
  startIndex: number,
  endIndex: number
): Promise<ThirdDimensionItem[]> {
  const pool = await getConnection();
  const result = await pool.request()
    .input('hos_cd', sql.NVarChar, hos_cd)
    .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
    .input('cso_cd', sql.NVarChar, cso_cd)
    .input('startIndex', sql.Int, startIndex)
    .input('endIndex', sql.Int, endIndex)
    .query(`
      SELECT s.drug_cd AS code, d.drug_name AS name,
             SUM(s.drug_cnt * s.drug_price) AS total_sales
      FROM SALES_TBL s
      LEFT JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
        AND s.sales_index BETWEEN d.start_index AND d.end_index
      WHERE s.hos_cd = @hos_cd AND s.hos_cso_cd = @hos_cso_cd
        AND s.cso_cd_then = @cso_cd
        AND s.sales_index BETWEEN @startIndex AND @endIndex
      GROUP BY s.drug_cd, d.drug_name
      ORDER BY SUM(s.drug_cnt * s.drug_price) DESC
    `);

  return result.recordset.map(r => ({
    code: r.code,
    name: formatDrugName(r.name) || r.code,
    total_sales: r.total_sales || 0
  }));
}

/**
 * 병원+품목 조합의 CSO 목록 조회
 */
async function getHospitalDrugCsos(
  hos_cd: string,
  hos_cso_cd: string,
  drug_cd: string,
  startIndex: number,
  endIndex: number
): Promise<ThirdDimensionItem[]> {
  const pool = await getConnection();
  const result = await pool.request()
    .input('hos_cd', sql.NVarChar, hos_cd)
    .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
    .input('drug_cd', sql.NVarChar, drug_cd)
    .input('startIndex', sql.Int, startIndex)
    .input('endIndex', sql.Int, endIndex)
    .query(`
      SELECT s.cso_cd_then AS code, ISNULL(c.cso_dealer_nm, '미지정') AS name,
             SUM(s.drug_cnt * s.drug_price) AS total_sales
      FROM SALES_TBL s
      LEFT JOIN CSO_TBL c ON s.cso_cd_then = c.cso_cd
      WHERE s.hos_cd = @hos_cd AND s.hos_cso_cd = @hos_cso_cd
        AND s.drug_cd = @drug_cd
        AND s.sales_index BETWEEN @startIndex AND @endIndex
      GROUP BY s.cso_cd_then, c.cso_dealer_nm
      ORDER BY SUM(s.drug_cnt * s.drug_price) DESC
    `);

  return result.recordset.map(r => ({
    code: r.code,
    name: r.name,
    total_sales: r.total_sales || 0
  }));
}

/**
 * CSO+품목 조합의 병원 목록 조회
 */
async function getCsoDrugHospitals(
  cso_cd: string,
  drug_cd: string,
  startIndex: number,
  endIndex: number
): Promise<ThirdDimensionItem[]> {
  const pool = await getConnection();
  const result = await pool.request()
    .input('cso_cd', sql.NVarChar, cso_cd)
    .input('drug_cd', sql.NVarChar, drug_cd)
    .input('startIndex', sql.Int, startIndex)
    .input('endIndex', sql.Int, endIndex)
    .query(`
      SELECT s.hos_cd + '|' + s.hos_cso_cd AS code,
             ISNULL(h.hos_abbr, h.hos_name) AS name,
             SUM(s.drug_cnt * s.drug_price) AS total_sales
      FROM SALES_TBL s
      LEFT JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd AND s.hos_cso_cd = h.hos_cso_cd
      WHERE s.cso_cd_then = @cso_cd AND s.drug_cd = @drug_cd
        AND s.sales_index BETWEEN @startIndex AND @endIndex
      GROUP BY s.hos_cd, s.hos_cso_cd, h.hos_abbr, h.hos_name
      ORDER BY SUM(s.drug_cnt * s.drug_price) DESC
    `);

  return result.recordset.map(r => ({
    code: r.code,
    name: r.name || '미지정',
    total_sales: r.total_sales || 0
  }));
}

// ========== 확장된 복합 조회 함수들 ==========

/**
 * CSO + HOSPITAL 확장 조회 (세번째 차원: 품목)
 */
export async function getCsoHospitalSalesExtended(
  cso_cd: string,
  hos_cd: string,
  hos_cso_cd: string,
  period?: PeriodInfo
): Promise<ExtendedCompositeResult | null> {
  const baseResult = await getCsoHospitalSales(cso_cd, hos_cd, hos_cso_cd, period);
  if (!baseResult) return null;

  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex } = periodInfo;

  // 세번째 차원: 품목 목록
  const drugs = await getHospitalCsoDrugs(hos_cd, hos_cso_cd, cso_cd, startIndex, endIndex);

  // CSO, 병원 정보 조회
  const pool = await getConnection();
  const [csoInfo, hospitalInfo] = await Promise.all([
    pool.request().input('cso_cd', sql.NVarChar, cso_cd)
      .query(`SELECT cso_dealer_nm FROM CSO_TBL WHERE cso_cd = @cso_cd`),
    pool.request().input('hos_cd', sql.NVarChar, hos_cd).input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .query(`SELECT hos_name, hos_abbr FROM HOSPITAL_TBL WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd`)
  ]);

  const csoName = csoInfo.recordset[0]?.cso_dealer_nm || cso_cd;
  const hospitalName = hospitalInfo.recordset[0]?.hos_abbr || hospitalInfo.recordset[0]?.hos_name || hos_cd;

  return {
    ...baseResult,
    thirdDimension: {
      type: 'DRUG',
      items: drugs.slice(0, 10),
      total_count: drugs.length
    },
    involvedEntities: {
      hospital: { hos_cd, hos_cso_cd, name: hospitalName },
      cso: { cso_cd, name: csoName }
    }
  };
}

/**
 * HOSPITAL + CSO 확장 조회 (세번째 차원: 품목)
 */
export async function getHospitalCsoSalesExtended(
  hos_cd: string,
  hos_cso_cd: string,
  cso_cd: string,
  period?: PeriodInfo
): Promise<ExtendedCompositeResult | null> {
  const baseResult = await getHospitalCsoSales(hos_cd, hos_cso_cd, cso_cd, period);
  if (!baseResult) return null;

  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex } = periodInfo;

  // 세번째 차원: 품목 목록
  const drugs = await getHospitalCsoDrugs(hos_cd, hos_cso_cd, cso_cd, startIndex, endIndex);

  // CSO, 병원 정보 조회
  const pool = await getConnection();
  const [csoInfo, hospitalInfo] = await Promise.all([
    pool.request().input('cso_cd', sql.NVarChar, cso_cd)
      .query(`SELECT cso_dealer_nm FROM CSO_TBL WHERE cso_cd = @cso_cd`),
    pool.request().input('hos_cd', sql.NVarChar, hos_cd).input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .query(`SELECT hos_name, hos_abbr FROM HOSPITAL_TBL WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd`)
  ]);

  const csoName = csoInfo.recordset[0]?.cso_dealer_nm || cso_cd;
  const hospitalName = hospitalInfo.recordset[0]?.hos_abbr || hospitalInfo.recordset[0]?.hos_name || hos_cd;

  return {
    ...baseResult,
    thirdDimension: {
      type: 'DRUG',
      items: drugs.slice(0, 10),
      total_count: drugs.length
    },
    involvedEntities: {
      hospital: { hos_cd, hos_cso_cd, name: hospitalName },
      cso: { cso_cd, name: csoName }
    }
  };
}

/**
 * CSO + DRUG 확장 조회 (세번째 차원: 병원)
 */
export async function getCsoDrugSalesExtended(
  cso_cd: string,
  drug_cd: string,
  period?: PeriodInfo
): Promise<ExtendedCompositeResult | null> {
  const baseResult = await getCsoDrugSales(cso_cd, drug_cd, period);
  if (!baseResult) return null;

  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex } = periodInfo;

  // 세번째 차원: 병원 목록
  const hospitals = await getCsoDrugHospitals(cso_cd, drug_cd, startIndex, endIndex);

  // CSO, 품목 정보 조회
  const pool = await getConnection();
  const [csoInfo, drugInfo] = await Promise.all([
    pool.request().input('cso_cd', sql.NVarChar, cso_cd)
      .query(`SELECT cso_dealer_nm FROM CSO_TBL WHERE cso_cd = @cso_cd`),
    pool.request().input('drug_cd', sql.NVarChar, drug_cd)
      .query(`SELECT drug_name FROM DRUG_TBL WHERE drug_cd = @drug_cd`)
  ]);

  const csoName = csoInfo.recordset[0]?.cso_dealer_nm || cso_cd;
  const drugName = formatDrugName(drugInfo.recordset[0]?.drug_name) || drug_cd;

  return {
    ...baseResult,
    thirdDimension: {
      type: 'HOSPITAL',
      items: hospitals.slice(0, 10),
      total_count: hospitals.length
    },
    involvedEntities: {
      cso: { cso_cd, name: csoName },
      drug: { drug_cd, name: drugName }
    }
  };
}

/**
 * DRUG + CSO 확장 조회 (세번째 차원: 병원)
 */
export async function getDrugCsoSalesExtended(
  drug_cd: string,
  cso_cd: string,
  period?: PeriodInfo
): Promise<ExtendedCompositeResult | null> {
  return getCsoDrugSalesExtended(cso_cd, drug_cd, period);
}

/**
 * HOSPITAL + DRUG 확장 조회 (세번째 차원: CSO)
 */
export async function getHospitalDrugSalesExtended(
  hos_cd: string,
  hos_cso_cd: string,
  drug_cd: string,
  period?: PeriodInfo
): Promise<ExtendedCompositeResult | null> {
  const baseResult = await getHospitalDrugSales(hos_cd, hos_cso_cd, drug_cd, period);
  if (!baseResult) return null;

  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex } = periodInfo;

  // 세번째 차원: CSO 목록
  const csos = await getHospitalDrugCsos(hos_cd, hos_cso_cd, drug_cd, startIndex, endIndex);

  // 병원, 품목 정보 조회
  const pool = await getConnection();
  const [hospitalInfo, drugInfo] = await Promise.all([
    pool.request().input('hos_cd', sql.NVarChar, hos_cd).input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .query(`SELECT hos_name, hos_abbr FROM HOSPITAL_TBL WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd`),
    pool.request().input('drug_cd', sql.NVarChar, drug_cd)
      .query(`SELECT drug_name FROM DRUG_TBL WHERE drug_cd = @drug_cd`)
  ]);

  const hospitalName = hospitalInfo.recordset[0]?.hos_abbr || hospitalInfo.recordset[0]?.hos_name || hos_cd;
  const drugName = formatDrugName(drugInfo.recordset[0]?.drug_name) || drug_cd;

  return {
    ...baseResult,
    thirdDimension: {
      type: 'CSO',
      items: csos.slice(0, 10),
      total_count: csos.length
    },
    involvedEntities: {
      hospital: { hos_cd, hos_cso_cd, name: hospitalName },
      drug: { drug_cd, name: drugName }
    }
  };
}

/**
 * DRUG + HOSPITAL 확장 조회 (세번째 차원: CSO)
 */
export async function getDrugHospitalSalesExtended(
  drug_cd: string,
  hos_cd: string,
  hos_cso_cd: string,
  period?: PeriodInfo
): Promise<ExtendedCompositeResult | null> {
  return getHospitalDrugSalesExtended(hos_cd, hos_cso_cd, drug_cd, period);
}

// ========== 버블 생성 함수들 ==========

/**
 * Depth3 복합 조회 결과용 단일 버블 생성
 */
export function createCompositeBubble(result: CompositeResult): any {
  const { title, subtitle, monthlySales, periodMonths, periodText } = result;
  const monthlyAvg = result.summary.total_sales / periodMonths;
  const trendText = monthlySales.map(m => formatSalesMoney(m.total_sales)).join(' > ');

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: title, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '8px'
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
            { type: 'text', text: title, size: 'md', color: COLORS.text, weight: 'bold', align: 'center', wrap: true },
            { type: 'text', text: subtitle, size: 'xs', color: COLORS.subtext, align: 'center', margin: 'xs' },
            { type: 'text', text: `조회기간: ${periodText}`, size: 'xs', color: COLORS.lightGray, align: 'center', margin: 'sm' },
            { type: 'separator', margin: 'md', color: COLORS.border },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '월평균', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'md'
            },
            { type: 'separator', margin: 'md', color: COLORS.border },
            { type: 'text', text: '월별 매출 추이', size: 'xs', color: COLORS.subtext, margin: 'md' },
            { type: 'text', text: trendText, size: 'sm', color: COLORS.text, weight: 'bold', align: 'center', margin: 'sm', wrap: true }
          ],
          backgroundColor: COLORS.white,
          cornerRadius: '12px',
          paddingAll: '16px',
          margin: 'md'
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
  };
}

/**
 * Depth3 확장 결과용 캐러셀 생성 (메인 버블 + 세번째 차원 버블)
 */
export function createCompositeCarousel(result: ExtendedCompositeResult): any {
  const bubbles: any[] = [];

  // 1. 메인 버블 (네비게이션 버튼 포함)
  const mainBubble = createMainCompositeBubble(result);
  bubbles.push(mainBubble);

  // 2. 세번째 차원 요약 버블
  if (result.thirdDimension && result.thirdDimension.items.length > 0) {
    const thirdBubble = createThirdDimensionBubble(result);
    bubbles.push(thirdBubble);
  }

  return {
    type: 'carousel',
    contents: bubbles
  };
}

/**
 * 메인 복합 버블 생성 (네비게이션 버튼 포함)
 */
function createMainCompositeBubble(result: ExtendedCompositeResult): any {
  const { title, subtitle, summary, monthlySales, periodMonths, periodText, involvedEntities } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
  const trendText = monthlySales.map(m => formatSalesMoney(m.total_sales)).join(' > ');

  // 네비게이션 버튼 생성 (바디에 배치)
  const buttons: any[] = [];

  // 병원 전체보기 버튼 (연한 노랑)
  if (involvedEntities.hospital) {
    const { hos_cd, hos_cso_cd } = involvedEntities.hospital;
    buttons.push({
      type: 'button',
      action: {
        type: 'postback',
        label: '병원전체보기',
        data: encodePostback({ d: 2, t: 'HOSPITAL', c: `${hos_cd}|${hos_cso_cd}` })
      },
      style: 'secondary',
      height: 'sm',
      color: COLORS.buttonAlt  // #FFFCCC
    });
  }

  // CSO 전체보기 버튼 (연한 파랑)
  if (involvedEntities.cso) {
    buttons.push({
      type: 'button',
      action: {
        type: 'postback',
        label: 'CSO전체보기',
        data: encodePostback({ d: 2, t: 'CSO', c: involvedEntities.cso.cso_cd })
      },
      style: 'secondary',
      height: 'sm',
      color: COLORS.lightBlue  // #DCEAF7
    });
  }

  // 바디 콘텐츠 구성
  const bodyContents: any[] = [
    { type: 'image', url: LOGO_URL, aspectRatio: '5:3', size: 'sm', aspectMode: 'fit' },
    {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: title, size: 'md', color: COLORS.text, weight: 'bold', align: 'center', wrap: true },
        { type: 'text', text: subtitle, size: 'xs', color: COLORS.subtext, align: 'center', margin: 'xs' },
        { type: 'text', text: `조회기간: ${periodText}`, size: 'xs', color: COLORS.lightGray, align: 'center', margin: 'sm' },
        { type: 'separator', margin: 'md', color: COLORS.border },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '월평균', size: 'sm', color: COLORS.subtext },
            { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
          ],
          margin: 'md'
        },
        { type: 'separator', margin: 'md', color: COLORS.border },
        { type: 'text', text: '월별 매출 추이', size: 'xs', color: COLORS.subtext, margin: 'md' },
        { type: 'text', text: trendText, size: 'sm', color: COLORS.text, weight: 'bold', align: 'center', margin: 'sm', wrap: true }
      ],
      backgroundColor: COLORS.white,
      cornerRadius: '12px',
      paddingAll: '16px',
      margin: 'md'
    }
  ];

  // 버튼이 있으면 흰색 둥근 상자로 감싸서 바디에 추가
  if (buttons.length > 0) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      contents: buttons,
      spacing: 'md',
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
        { type: 'text', text: title, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }
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
 * 세번째 차원 요약 버블 생성
 */
function createThirdDimensionBubble(result: ExtendedCompositeResult): any {
  const { title, thirdDimension } = result;

  if (!thirdDimension) return null;

  const dimensionTitle =
    thirdDimension.type === 'DRUG' ? '거래 품목' :
    thirdDimension.type === 'CSO' ? '거래 CSO' : '거래 병원';

  // 상위 5개 항목 표시
  const itemRows: any[] = thirdDimension.items.slice(0, 5).map((item, index) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: `${index + 1}. ${item.name}`, size: 'xs', color: COLORS.text, flex: 3, wrap: true },
      { type: 'text', text: formatSalesMoney(item.total_sales), size: 'xs', weight: 'bold', color: COLORS.navy, align: 'end', flex: 2 }
    ],
    margin: index === 0 ? 'none' : 'sm'
  }));

  // 5개 초과 시 "외 N건" 표시
  const additionalCount = thirdDimension.total_count - 5;
  if (additionalCount > 0) {
    itemRows.push({
      type: 'text',
      text: `외 ${additionalCount}건`,
      size: 'xs',
      color: COLORS.lightGray,
      align: 'end',
      margin: 'sm'
    });
  }

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: title, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '8px'
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
            { type: 'text', text: dimensionTitle, size: 'md', weight: 'bold', color: COLORS.text, align: 'center' },
            { type: 'text', text: `총 ${thirdDimension.total_count}건`, size: 'xs', color: COLORS.lightGray, align: 'center', margin: 'xs' },
            { type: 'separator', margin: 'md', color: COLORS.border },
            ...itemRows
          ],
          backgroundColor: COLORS.white,
          cornerRadius: '12px',
          paddingAll: '16px',
          margin: 'md'
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
  };
}
