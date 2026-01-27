/**
 * Depth3 복합 조회 서비스
 * 두 엔티티의 조합 매출 조회
 */

import { getConnection } from '../database/connection';
import sql from 'mssql';
import { formatDrugName } from '../../utils/drugNameFormatter';
import { formatSalesMoney } from '../../utils/numberFormatter';
import { COLORS, LOGO_URL } from '../../utils/bubbleBuilder';
import { getCurrentPeriod, PeriodInfo } from './periodService';

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

/**
 * Depth3 복합 조회 결과용 단일 버블 생성
 */
export function createCompositeBubble(result: CompositeResult): any {
  const { title, subtitle, summary, monthlySales, periodMonths, periodText } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
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
                { type: 'text', text: '총 매출', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: formatSalesMoney(summary.total_sales), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '월평균', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'sm'
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
