/**
 * 품목(약품) 상세 매출 조회 서비스 (V2)
 * Depth2 DRUG 조회
 */

import { getConnection } from '../database/connection';
import sql from 'mssql';
import { formatDrugName } from '../../utils/drugNameFormatter';
import { formatSalesMoney } from '../../utils/numberFormatter';
import { COLORS, LOGO_URL } from '../../utils/bubbleBuilder';
import { getCurrentPeriod, PeriodInfo } from './periodService';
import {
  encodePostback,
  createDrugHospitalPostback,
  createDrugCsoPostback,
} from '../../types/postback';
import { getDrugInfo, createDrugInfoBubble, DrugInfo as DrugDetailInfo } from './drugInfoService';

// 버블당 최대 버튼 수
const MAX_BUTTONS_PER_BUBBLE = 5;
// 최대 병원 수
const MAX_HOSPITALS = 20;
// 최대 CSO 수
const MAX_CSOS = 10;

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
  monthlySales: number[];
}

interface CsoSalesData {
  cso_cd: string;
  cso_dealer_nm: string;
  total_sales: number;
  monthlySales: number[];
}

interface DrugInfo {
  drug_cd: string;
  drug_name: string;
}

export interface DrugSalesResult {
  drug: DrugInfo;
  drugDetailInfo?: DrugDetailInfo;  // 의약품 상세 정보 (약가, 수수료율, 성분 등)
  summary: {
    total_sales: number;
    hospital_count: number;
    cso_count: number;
  };
  monthlySales: MonthlySalesData[];
  topHospitals: HospitalSalesData[];
  topCsos: CsoSalesData[];
  periodMonths: number;
  periodText: string;
}

/**
 * 품목 상세 매출 조회 (V2)
 * @param drug_cd 품목 코드
 * @param period 기간 정보 (선택적)
 */
export async function getDrugSales(drug_cd: string, period?: PeriodInfo): Promise<DrugSalesResult | null> {
  const pool = await getConnection();

  // 품목 기본 정보 조회
  const drugInfoResult = await pool.request()
    .input('drug_cd', sql.NVarChar, drug_cd)
    .query(`
      SELECT drug_cd, drug_name
      FROM DRUG_TBL
      WHERE drug_cd = @drug_cd AND drug_isvalid = 'Y'
    `);

  if (drugInfoResult.recordset.length === 0) {
    return null;
  }

  const drug = drugInfoResult.recordset[0] as DrugInfo;

  // 기간 정보 (없으면 현재 기간 조회)
  const periodInfo = period || await getCurrentPeriod(3);
  const { startIndex, endIndex, periodText, periodMonths } = periodInfo;

  // 병렬 쿼리 실행 (의약품 상세 정보 포함)
  const [
    monthlyResult,
    hospitalResult,
    hospitalMonthlyResult,
    csoResult,
    csoMonthlyResult,
    hospitalCountResult,
    csoCountResult,
    drugDetailInfo
  ] = await Promise.all([
    // 월별 매출
    pool.request()
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT sales_year, sales_month, sales_index, total_sales
        FROM V_DRUG_MONTHLY_SALES_byClaude
        WHERE drug_cd = @drug_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        ORDER BY sales_index
      `),

    // TOP 병원 (최대 20개) - SALES_TBL 직접 조회
    pool.request()
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_HOSPITALS)
      .query(`
        SELECT TOP (@limit)
          s.hos_cd, s.hos_cso_cd,
          h.hos_name, h.hos_abbr,
          SUM(s.drug_cnt * s.drug_price) AS total_sales
        FROM SALES_TBL s
        JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd AND s.hos_cso_cd = h.hos_cso_cd
        WHERE s.drug_cd = @drug_cd
          AND s.sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY s.hos_cd, s.hos_cso_cd, h.hos_name, h.hos_abbr
        ORDER BY SUM(s.drug_cnt * s.drug_price) DESC
      `),

    // TOP 병원별 월별 매출 - SALES_TBL 직접 조회
    pool.request()
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_HOSPITALS)
      .query(`
        SELECT s.hos_cd, s.hos_cso_cd, s.sales_index, SUM(s.drug_cnt * s.drug_price) AS total_sales
        FROM SALES_TBL s
        WHERE s.drug_cd = @drug_cd
          AND s.sales_index BETWEEN @startIndex AND @endIndex
          AND s.hos_cd + '|' + s.hos_cso_cd IN (
            SELECT TOP (@limit) hos_cd + '|' + hos_cso_cd
            FROM SALES_TBL
            WHERE drug_cd = @drug_cd
              AND sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY hos_cd, hos_cso_cd
            ORDER BY SUM(drug_cnt * drug_price) DESC
          )
        GROUP BY s.hos_cd, s.hos_cso_cd, s.sales_index
        ORDER BY s.hos_cd, s.hos_cso_cd, s.sales_index
      `),

    // TOP CSO (최대 10개) - SALES_TBL 직접 조회
    pool.request()
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_CSOS)
      .query(`
        SELECT TOP (@limit)
          s.cso_cd_then AS cso_cd,
          ISNULL(c.cso_dealer_nm, '미지정') AS cso_dealer_nm,
          SUM(s.drug_cnt * s.drug_price) AS total_sales
        FROM SALES_TBL s
        LEFT JOIN CSO_TBL c ON s.cso_cd_then = c.cso_cd
        WHERE s.drug_cd = @drug_cd
          AND s.sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY s.cso_cd_then, c.cso_dealer_nm
        ORDER BY SUM(s.drug_cnt * s.drug_price) DESC
      `),

    // TOP CSO별 월별 매출 - SALES_TBL 직접 조회
    pool.request()
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .input('limit', sql.Int, MAX_CSOS)
      .query(`
        SELECT
          s.cso_cd_then AS cso_cd,
          ISNULL(c.cso_dealer_nm, '미지정') AS cso_dealer_nm,
          s.sales_index,
          SUM(s.drug_cnt * s.drug_price) AS total_sales
        FROM SALES_TBL s
        LEFT JOIN CSO_TBL c ON s.cso_cd_then = c.cso_cd
        WHERE s.drug_cd = @drug_cd
          AND s.sales_index BETWEEN @startIndex AND @endIndex
          AND s.cso_cd_then IN (
            SELECT TOP (@limit) cso_cd_then
            FROM SALES_TBL
            WHERE drug_cd = @drug_cd
              AND sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY cso_cd_then
            ORDER BY SUM(drug_cnt * drug_price) DESC
          )
        GROUP BY s.cso_cd_then, c.cso_dealer_nm, s.sales_index
        ORDER BY s.cso_cd_then, s.sales_index
      `),

    // 요약 - 병원 수 (SALES_TBL 직접 조회)
    pool.request()
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT COUNT(DISTINCT hos_cd + hos_cso_cd) AS hospital_count
        FROM SALES_TBL
        WHERE drug_cd = @drug_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
      `),

    // 요약 - CSO 수 (SALES_TBL 직접 조회)
    pool.request()
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT COUNT(DISTINCT cso_cd_then) AS cso_count
        FROM SALES_TBL
        WHERE drug_cd = @drug_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
      `),

    // 의약품 상세 정보 (약가, 수수료율, 성분 등)
    getDrugInfo(drug_cd)
  ]);

  const monthlySales = monthlyResult.recordset as MonthlySalesData[];
  const hospitalCountData = hospitalCountResult.recordset[0];
  const csoCountData = csoCountResult.recordset[0];

  // 병원별 월별 매출 데이터 조합
  const hospitalTotals = hospitalResult.recordset as {
    hos_cd: string;
    hos_cso_cd: string;
    hos_name: string;
    hos_abbr: string | null;
    total_sales: number;
  }[];
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

  // CSO별 월별 매출 데이터 조합
  const csoTotals = csoResult.recordset as { cso_cd: string; cso_dealer_nm: string; total_sales: number }[];
  const csoMonthlyData = csoMonthlyResult.recordset as {
    cso_cd: string;
    cso_dealer_nm: string;
    sales_index: number;
    total_sales: number;
  }[];

  const topCsos: CsoSalesData[] = csoTotals.map(cso => {
    const monthlyData = csoMonthlyData
      .filter(c => c.cso_cd === cso.cso_cd)
      .sort((a, b) => a.sales_index - b.sales_index)
      .map(c => c.total_sales);

    return {
      cso_cd: cso.cso_cd,
      cso_dealer_nm: cso.cso_dealer_nm,
      total_sales: cso.total_sales,
      monthlySales: monthlyData
    };
  });

  const totalSales = monthlySales.reduce((sum, m) => sum + m.total_sales, 0);

  return {
    drug,
    drugDetailInfo: drugDetailInfo || undefined,
    summary: {
      total_sales: totalSales,
      hospital_count: hospitalCountData?.hospital_count || 0,
      cso_count: csoCountData?.cso_count || 0
    },
    monthlySales,
    topHospitals,
    topCsos,
    periodMonths,
    periodText
  };
}

/**
 * DRUG Depth2 캐러셀 생성 (V2)
 * - 의약품 정보 버블 (약가, 수수료율, 성분 등)
 * - 요약 버블
 * - 주요병원별 매출 버블 (최대 4개, 버블당 5개 버튼)
 * - 주요CSO별 매출 버블 (최대 2개)
 * @param result 품목 매출 조회 결과
 * @param isAdmin 관리자 여부 (true면 관리자용 수수료율 표시)
 */
export function createDrugCarousel(result: DrugSalesResult, isAdmin: boolean = false): any {
  const { drug, drugDetailInfo, summary, monthlySales, topHospitals, topCsos, periodMonths, periodText } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
  const trendText = monthlySales.map(m => formatSalesMoney(m.total_sales)).join(' > ');

  const drugTitle = formatDrugName(drug.drug_name);

  const bubbles: any[] = [];

  // 1. 의약품 정보 버블 (맨 앞)
  if (drugDetailInfo) {
    bubbles.push(createDrugInfoBubble(drugDetailInfo, isAdmin));
  }

  // 2. 요약 버블
  bubbles.push(createSummaryBubble(drug, drugTitle, summary, monthlyAvg, trendText, periodText));

  // 2. 주요병원별 매출 버블들 (버블당 5개 버튼, 최대 4개 버블)
  if (topHospitals.length > 0) {
    const hospitalBubbles = createHospitalBubbles(drug.drug_cd, topHospitals, periodText, drugTitle);
    bubbles.push(...hospitalBubbles);
  }

  // 3. 주요CSO별 매출 버블들 (버블당 5개 버튼, 최대 2개 버블)
  if (topCsos.length > 0) {
    const csoBubbles = createCsoBubbles(drug.drug_cd, topCsos, periodText, drugTitle);
    bubbles.push(...csoBubbles);
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
  _drug: DrugInfo,
  drugTitle: string,
  summary: DrugSalesResult['summary'],
  monthlyAvg: number,
  trendText: string,
  periodText: string
): any {
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: drugTitle, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }
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
            { type: 'text', text: drugTitle, size: 'md', color: COLORS.text, weight: 'bold', align: 'center', wrap: true },
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
function createHospitalBubbles(drug_cd: string, hospitals: HospitalSalesData[], periodText: string, drugTitle: string): any[] {
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
      const postback = createDrugHospitalPostback(drug_cd, hospital.hos_cd, hospital.hos_cso_cd);

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

    // 병원 정보 행
    const hospitalInfoRows = chunk.map(hospital => {
      const trendText = hospital.monthlySales.length > 0
        ? hospital.monthlySales.map(s => formatSalesMoney(s)).join(' > ')
        : '';
      const monthlyAvg = hospital.monthlySales.length > 0
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
        contents: [{ type: 'text', text: drugTitle, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }],
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
 * 주요CSO별 매출 버블들 생성
 */
function createCsoBubbles(drug_cd: string, csos: CsoSalesData[], periodText: string, drugTitle: string): any[] {
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
      const postback = createDrugCsoPostback(drug_cd, cso.cso_cd);

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
        contents: [{ type: 'text', text: drugTitle, size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }],
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
