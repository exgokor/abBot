/**
 * CSO 상세 매출 조회 서비스 (V2)
 * Depth2 CSO 조회
 */

import { getConnection } from '../database/connection';
import sql from 'mssql';
import { formatDrugName } from '../../utils/drugNameFormatter';
import { formatSalesMoney } from '../../utils/numberFormatter';
import { COLORS, LOGO_URL } from '../../utils/bubbleBuilder';
import { getCurrentPeriod, PeriodInfo } from './periodService';
import {
  encodePostback,
  createCsoHospitalPostback,
  createCsoDrugPostback,
} from '../../types/postback';

// 버블당 최대 버튼 수
const MAX_BUTTONS_PER_BUBBLE = 5;
// 최대 병원 수
const MAX_HOSPITALS = 20;
// 최대 품목 수
const MAX_DRUGS = 10;

interface MonthlySalesData {
  sales_year: number;
  sales_month: number;
  sales_index: number;
  total_sales: number;
}

interface HospitalSalesData {
  hos_cd: string;
  hos_cso_cd: string;
  hos_name: string;
  hos_abbr: string | null;
  total_sales: number;
  monthlySales?: number[];
}

interface DrugSalesData {
  drug_cd: string;
  drug_name: string;
  total_sales: number;
  monthlySales: number[];
}

interface CsoInfo {
  cso_cd: string;
  cso_dealer_nm: string;
  cso_corp_nm: string | null;
}

export interface CsoSalesResult {
  cso: CsoInfo;
  summary: {
    total_sales: number;
    hospital_count: number;
    drug_count: number;
  };
  monthlySales: MonthlySalesData[];
  topHospitals: HospitalSalesData[];
  topDrugs: DrugSalesData[];
  periodMonths: number;
  periodText: string;
}

/**
 * CSO 상세 매출 조회 (V2)
 * @param cso_cd CSO 코드
 * @param period 기간 정보 (선택적)
 */
export async function getCsoSales(cso_cd: string, period?: PeriodInfo): Promise<CsoSalesResult | null> {
  const pool = await getConnection();

  // CSO 기본 정보 조회
  const csoInfoResult = await pool.request()
    .input('cso_cd', sql.NVarChar, cso_cd)
    .query(`
      SELECT cso_cd, cso_dealer_nm, cso_corp_nm
      FROM CSO_TBL
      WHERE cso_cd = @cso_cd AND cso_is_valid = 'Y'
    `);

  if (csoInfoResult.recordset.length === 0) {
    return null;
  }

  const cso = csoInfoResult.recordset[0] as CsoInfo;

  // 기간 정보 (없으면 현재 기간 조회)
  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex, periodText, periodMonths } = periodInfo;

  // 병렬 쿼리 실행
  const [
    monthlyResult,
    hospitalResult,
    hospitalMonthlyResult,
    drugResult,
    drugMonthlyResult,
    hospitalCountResult,
    drugCountResult
  ] = await Promise.all([
    // 월별 매출
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT sales_year, sales_month, sales_index, total_sales
        FROM V_CSO_MONTHLY_SALES_byClaude
        WHERE cso_cd = @cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        ORDER BY sales_index
      `),

    // TOP 병원 (최대 20개)
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_HOSPITALS)
      .query(`
        SELECT TOP (@limit)
          ch.hos_cd, ch.hos_cso_cd,
          h.hos_name, h.hos_abbr,
          SUM(ch.total_sales) AS total_sales
        FROM V_CSO_HOSPITAL_MONTHLY_byClaude ch
        JOIN HOSPITAL_TBL h ON ch.hos_cd = h.hos_cd AND ch.hos_cso_cd = h.hos_cso_cd
        WHERE ch.cso_cd = @cso_cd
          AND ch.sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY ch.hos_cd, ch.hos_cso_cd, h.hos_name, h.hos_abbr
        ORDER BY SUM(ch.total_sales) DESC
      `),

    // TOP 병원별 월별 매출 (트렌드용)
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_HOSPITALS)
      .query(`
        SELECT ch.hos_cd, ch.hos_cso_cd, ch.sales_index, ch.total_sales
        FROM V_CSO_HOSPITAL_MONTHLY_byClaude ch
        WHERE ch.cso_cd = @cso_cd
          AND ch.sales_index BETWEEN @startIndex AND @endIndex
          AND ch.hos_cd + '|' + ch.hos_cso_cd IN (
            SELECT TOP (@limit) hos_cd + '|' + hos_cso_cd
            FROM V_CSO_HOSPITAL_MONTHLY_byClaude
            WHERE cso_cd = @cso_cd
              AND sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY hos_cd, hos_cso_cd
            ORDER BY SUM(total_sales) DESC
          )
        ORDER BY ch.hos_cd, ch.hos_cso_cd, ch.sales_index
      `),

    // TOP 품목 (최대 10개)
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_DRUGS)
      .query(`
        SELECT TOP (@limit)
          cd.drug_cd, cd.drug_name,
          SUM(cd.total_sales) AS total_sales
        FROM V_CSO_DRUG_MONTHLY_byClaude cd
        WHERE cd.cso_cd = @cso_cd
          AND cd.sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY cd.drug_cd, cd.drug_name
        ORDER BY SUM(cd.total_sales) DESC
      `),

    // TOP 품목별 월별 매출
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_DRUGS)
      .query(`
        SELECT cd.drug_cd, cd.drug_name, cd.sales_index, cd.total_sales
        FROM V_CSO_DRUG_MONTHLY_byClaude cd
        WHERE cd.cso_cd = @cso_cd
          AND cd.sales_index BETWEEN @startIndex AND @endIndex
          AND cd.drug_cd IN (
            SELECT TOP (@limit) drug_cd
            FROM V_CSO_DRUG_MONTHLY_byClaude
            WHERE cso_cd = @cso_cd
              AND sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY drug_cd
            ORDER BY SUM(total_sales) DESC
          )
        ORDER BY cd.drug_cd, cd.sales_index
      `),

    // 요약 - 병원 수
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT COUNT(DISTINCT hos_cd + hos_cso_cd) AS hospital_count
        FROM V_CSO_HOSPITAL_MONTHLY_byClaude
        WHERE cso_cd = @cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
      `),

    // 요약 - 품목 수
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT COUNT(DISTINCT drug_cd) AS drug_count
        FROM V_CSO_DRUG_MONTHLY_byClaude
        WHERE cso_cd = @cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
      `)
  ]);

  const monthlySales = monthlyResult.recordset as MonthlySalesData[];
  const hospitalCountData = hospitalCountResult.recordset[0];
  const drugCountData = drugCountResult.recordset[0];

  // 병원별 월별 매출 데이터 조합
  const hospitalTotals = hospitalResult.recordset as HospitalSalesData[];
  const hospitalMonthlyData = hospitalMonthlyResult.recordset as {
    hos_cd: string;
    hos_cso_cd: string;
    sales_index: number;
    total_sales: number;
  }[];

  const topHospitals: HospitalSalesData[] = hospitalTotals.map(hospital => {
    const monthlyData = hospitalMonthlyData
      .filter(h => h.hos_cd === hospital.hos_cd && h.hos_cso_cd === hospital.hos_cso_cd)
      .sort((a, b) => a.sales_index - b.sales_index)
      .map(h => h.total_sales);

    return {
      ...hospital,
      monthlySales: monthlyData
    };
  });

  // 품목별 월별 매출 데이터 조합
  const drugTotals = drugResult.recordset as { drug_cd: string; drug_name: string; total_sales: number }[];
  const drugMonthlyData = drugMonthlyResult.recordset as {
    drug_cd: string;
    drug_name: string;
    sales_index: number;
    total_sales: number;
  }[];

  const topDrugs: DrugSalesData[] = drugTotals.map(drug => {
    const monthlyData = drugMonthlyData
      .filter(d => d.drug_cd === drug.drug_cd)
      .sort((a, b) => a.sales_index - b.sales_index)
      .map(d => d.total_sales);

    return {
      drug_cd: drug.drug_cd,
      drug_name: drug.drug_name,
      total_sales: drug.total_sales,
      monthlySales: monthlyData
    };
  });

  const totalSales = monthlySales.reduce((sum, m) => sum + m.total_sales, 0);

  return {
    cso,
    summary: {
      total_sales: totalSales,
      hospital_count: hospitalCountData?.hospital_count || 0,
      drug_count: drugCountData?.drug_count || 0
    },
    monthlySales,
    topHospitals,
    topDrugs,
    periodMonths,
    periodText
  };
}

/**
 * CSO Depth2 캐러셀 생성 (V2)
 * - 요약 버블
 * - 주요병원별 매출 버블 (최대 4개, 버블당 5개 버튼)
 * - 주요품목별 매출 버블 (최대 2개)
 */
export function createCsoCarousel(result: CsoSalesResult): any {
  const { cso, summary, monthlySales, topHospitals, topDrugs, periodMonths, periodText } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
  const trendText = monthlySales.map(m => formatSalesMoney(m.total_sales)).join(' > ');

  // 헤더용 타이틀: 협력사명-딜러명
  const csoHeaderTitle = cso.cso_corp_nm
    ? `${cso.cso_corp_nm}-${cso.cso_dealer_nm}`
    : cso.cso_dealer_nm;
  // 본문용 타이틀: 딜러명 (협력사명)
  const csoBodyTitle = cso.cso_corp_nm
    ? `${cso.cso_dealer_nm} (${cso.cso_corp_nm})`
    : cso.cso_dealer_nm;

  const bubbles: any[] = [];

  // 1. 요약 버블
  bubbles.push(createSummaryBubble(cso, csoHeaderTitle, csoBodyTitle, summary, monthlyAvg, trendText, periodText, periodMonths));

  // 2. 주요병원별 매출 버블들 (버블당 5개 버튼, 최대 4개 버블)
  if (topHospitals.length > 0) {
    const hospitalBubbles = createHospitalBubbles(cso.cso_cd, topHospitals, periodText, csoHeaderTitle);
    bubbles.push(...hospitalBubbles);
  }

  // 3. 주요품목별 매출 버블들 (버블당 5개 버튼, 최대 2개 버블)
  if (topDrugs.length > 0) {
    const drugBubbles = createDrugBubbles(cso.cso_cd, topDrugs, periodText, csoHeaderTitle);
    bubbles.push(...drugBubbles);
  }

  return {
    type: 'carousel',
    contents: bubbles
  };
}

/**
 * 요약 버블 생성
 */
function createSummaryBubble(
  _cso: CsoInfo,
  csoHeaderTitle: string,
  csoBodyTitle: string,
  summary: CsoSalesResult['summary'],
  monthlyAvg: number,
  trendText: string,
  periodText: string,
  _periodMonths: number
): any {
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: csoHeaderTitle, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }
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
            { type: 'text', text: csoBodyTitle, size: 'md', color: COLORS.text, weight: 'bold', align: 'center', wrap: true },
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
                { type: 'text', text: '거래 병원', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: `${summary.hospital_count}개`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '거래 품목', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: `${summary.drug_count}개`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'sm'
            }
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
 * 주요병원별 매출 버블들 생성
 */
function createHospitalBubbles(cso_cd: string, hospitals: HospitalSalesData[], periodText: string, csoHeaderTitle: string): any[] {
  const bubbles: any[] = [];
  const totalBubbles = Math.ceil(hospitals.length / MAX_BUTTONS_PER_BUBBLE);

  for (let i = 0; i < hospitals.length; i += MAX_BUTTONS_PER_BUBBLE) {
    const chunk = hospitals.slice(i, i + MAX_BUTTONS_PER_BUBBLE);
    const bubbleIndex = Math.floor(i / MAX_BUTTONS_PER_BUBBLE) + 1;

    const title = totalBubbles > 1
      ? `주요 병원 (${bubbleIndex}/${totalBubbles})`
      : '주요 병원';

    const buttons = chunk.map((hospital, index) => {
      const label = hospital.hos_abbr || hospital.hos_name;
      const displayLabel = label.length > 15 ? label.slice(0, 13) + '..' : label;
      const postback = createCsoHospitalPostback(cso_cd, hospital.hos_cd, hospital.hos_cso_cd);

      return {
        type: 'button',
        action: {
          type: 'postback',
          label: `${displayLabel}`,
          data: encodePostback(postback),
        },
        style: 'secondary',  // 검정 글씨
        height: 'sm',
        color: index % 2 === 0 ? COLORS.buttonAlt : COLORS.lightBlue,
        margin: 'sm',
      };
    });

    // 병원 버블에 트렌드 정보 추가
    const hospitalInfoRows = chunk.map(hospital => {
      const trendText = hospital.monthlySales && hospital.monthlySales.length > 0
        ? hospital.monthlySales.map(s => formatSalesMoney(s)).join(' > ')
        : '';
      const monthlyAvg = hospital.monthlySales && hospital.monthlySales.length > 0
        ? hospital.monthlySales.reduce((a, b) => a + b, 0) / hospital.monthlySales.length
        : hospital.total_sales / 3;

      return {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: hospital.hos_abbr || hospital.hos_name, size: 'xs', color: COLORS.text, flex: 3, wrap: true },
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
        contents: [{ type: 'text', text: csoHeaderTitle, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }],
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
              ...hospitalInfoRows,
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
 * 주요품목별 매출 버블들 생성
 */
function createDrugBubbles(cso_cd: string, drugs: DrugSalesData[], periodText: string, csoHeaderTitle: string): any[] {
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

      const postback = createCsoDrugPostback(cso_cd, drug.drug_cd);

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
        contents: [{ type: 'text', text: csoHeaderTitle, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }],
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
