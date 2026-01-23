/**
 * CSO 상세 매출 조회 서비스
 */

import { getConnection } from '../database/connection';
import sql from 'mssql';
import { formatDrugName } from '../../utils/drugNameFormatter';
import {
  formatSalesMoney,
  formatMonthlyTrend as formatTrend,
  formatMonthlyAvg,
  formatDrugMonthlyTrend
} from '../../utils/numberFormatter';

// 색상 팔레트
const COLORS = {
  darkNavy: '#0D1B4C',
  background: '#F0F8FF',
  white: '#FFFFFF',
  navy: '#1D3A8F',
  text: '#000000',
  subtext: '#666666',
  lightGray: '#999999',
  border: '#E5E5E5'
};

// 로고 URL
const LOGO_URL = 'https://storage.worksmobile.com/k1/drive/r/24101/300118260/300118260/@2001000000362831/3472530909344205321?fileId=QDIwMDEwMDAwMDAzNjI4MzF8MzQ3MjUzMDkwOTM0NDIwNTMyMXxGfDA&downloadType=O&resourceType=thumbnail&resourceFormat=origin&cache=1734582221372&conditionalAccessPolicy=false';

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
}

interface DrugSalesData {
  drug_cd: string;
  drug_name: string;
  total_sales: number;
  monthlySales: number[];  // 월별 매출 배열
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
 * CSO 상세 매출 조회
 * @param cso_cd CSO 코드
 * @param requestedMonths 요청 기간 (3, 6, 12개월). 기본값 3
 */
export async function getCsoSales(cso_cd: string, requestedMonths: number = 3): Promise<CsoSalesResult | null> {
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

  // 데이터 범위 확인
  const dataRangeResult = await pool.request()
    .input('cso_cd', sql.NVarChar, cso_cd)
    .query(`
      SELECT MIN(sales_index) AS min_index, MAX(sales_index) AS max_index
      FROM V_CSO_MONTHLY_SALES_byClaude
      WHERE cso_cd = @cso_cd
    `);

  const dataRange = dataRangeResult.recordset[0];
  if (!dataRange.max_index) {
    return null;
  }

  // 요청된 기간만큼 조회 (실제 데이터 범위 내에서)
  const endIndex = dataRange.max_index;
  const startIndex = Math.max(dataRange.min_index, endIndex - (requestedMonths - 1));
  const periodMonths = endIndex - startIndex + 1;

  const startYear = 2000 + Math.floor(startIndex / 12);
  const startMonth = (startIndex % 12) + 1;
  const endYear = 2000 + Math.floor(endIndex / 12);
  const endMonth = (endIndex % 12) + 1;
  const periodText = `${startYear}.${startMonth} ~ ${endYear}.${endMonth}`;

  // 병렬 쿼리 실행
  const [monthlyResult, hospitalResult, drugResult, drugMonthlyResult, summaryResult] = await Promise.all([
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

    // TOP 병원
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT TOP 5
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

    // TOP 품목 (총합)
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT TOP 5
          cd.drug_cd, cd.drug_name,
          SUM(cd.total_sales) AS total_sales
        FROM V_CSO_DRUG_MONTHLY_byClaude cd
        WHERE cd.cso_cd = @cso_cd
          AND cd.sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY cd.drug_cd, cd.drug_name
        ORDER BY SUM(cd.total_sales) DESC
      `),

    // TOP 5 품목별 월별 매출
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT cd.drug_cd, cd.drug_name, cd.sales_index, cd.total_sales
        FROM V_CSO_DRUG_MONTHLY_byClaude cd
        WHERE cd.cso_cd = @cso_cd
          AND cd.sales_index BETWEEN @startIndex AND @endIndex
          AND cd.drug_cd IN (
            SELECT TOP 5 drug_cd
            FROM V_CSO_DRUG_MONTHLY_byClaude
            WHERE cso_cd = @cso_cd
              AND sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY drug_cd
            ORDER BY SUM(total_sales) DESC
          )
        ORDER BY cd.drug_cd, cd.sales_index
      `),

    // 요약
    pool.request()
      .input('cso_cd', sql.NVarChar, cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT
          COUNT(DISTINCT hos_cd + hos_cso_cd) AS hospital_count,
          COUNT(DISTINCT drug_cd) AS drug_count
        FROM V_CSO_HOSPITAL_MONTHLY_byClaude
        WHERE cso_cd = @cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
      `)
  ]);

  const monthlySales = monthlyResult.recordset as MonthlySalesData[];
  const topHospitals = hospitalResult.recordset as HospitalSalesData[];
  const summaryData = summaryResult.recordset[0];

  // 품목별 월별 매출 데이터 조합
  const drugTotals = drugResult.recordset as { drug_cd: string; drug_name: string; total_sales: number }[];
  const drugMonthlyData = drugMonthlyResult.recordset as { drug_cd: string; drug_name: string; sales_index: number; total_sales: number }[];

  // drug_cd별로 월별 매출 배열 생성
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
      hospital_count: summaryData?.hospital_count || 0,
      drug_count: summaryData?.drug_count || 0
    },
    monthlySales,
    topHospitals,
    topDrugs,
    periodMonths,
    periodText
  };
}

// MonthlySalesData 배열을 숫자 배열로 변환하여 포맷팅
function formatMonthlyTrend(monthlySales: MonthlySalesData[]): string {
  return formatTrend(monthlySales.map(m => m.total_sales));
}

/**
 * CSO 상세 캐러셀 생성
 */
export function createCsoCarousel(result: CsoSalesResult): any {
  const { cso, summary, monthlySales, topHospitals, topDrugs, periodMonths, periodText } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
  const trendText = formatMonthlyTrend(monthlySales);

  // 제목 (딜러명 + 법인명)
  const csoTitle = cso.cso_corp_nm
    ? `${cso.cso_dealer_nm} (${cso.cso_corp_nm})`
    : cso.cso_dealer_nm;

  // 병원별 매출 컨텐츠
  const hospitalContents: any[] = topHospitals.map((hospital, index) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: `${index + 1}. ${hospital.hos_abbr || hospital.hos_name}`,
        size: 'xs',
        color: COLORS.subtext,
        flex: 3,
        wrap: true
      },
      {
        type: 'text',
        text: formatSalesMoney(hospital.total_sales),
        size: 'xs',
        weight: 'bold',
        color: COLORS.text,
        align: 'end',
        flex: 2
      }
    ],
    margin: 'md'
  }));

  // 품목별 매출 컨텐츠 (새 포맷: 품목명 + 월별추이 + 월평균)
  const drugContents: any[] = topDrugs.map((drug) => ({
    type: 'box',
    layout: 'vertical',
    contents: [
      // 1행: 품목명 (텍스트 정리 적용)
      { type: 'text', text: formatDrugName(drug.drug_name), size: 'sm', color: COLORS.text, weight: 'bold', wrap: true },
      // 2행: (월별 추이)         월평균
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `( ${formatDrugMonthlyTrend(drug.monthlySales)} )`, size: 'xs', color: COLORS.subtext, flex: 3 },
          { type: 'text', text: formatMonthlyAvg(drug.monthlySales), size: 'xs', weight: 'bold', color: COLORS.text, align: 'end', flex: 1 }
        ],
        margin: 'sm'
      }
    ],
    margin: 'lg'
  }));

  // 메인 버블
  const mainBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          size: 'sm',
          weight: 'bold',
          color: COLORS.white,
          align: 'center'
        }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '8px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'image',
          url: LOGO_URL,
          aspectRatio: '5:3',
          size: 'sm',
          aspectMode: 'fit'
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: csoTitle,
              size: 'md',
              color: COLORS.text,
              weight: 'bold',
              align: 'center',
              wrap: true
            },
            {
              type: 'text',
              text: `${periodText} (${periodMonths}개월)`,
              size: 'xs',
              color: COLORS.lightGray,
              align: 'center',
              margin: 'sm'
            },
            {
              type: 'separator',
              margin: 'md',
              color: COLORS.border
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '월평균 매출', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'md'
            },
            {
              type: 'text',
              text: `(${trendText})`,
              size: 'xs',
              color: COLORS.subtext,
              align: 'end',
              margin: 'sm'
            },
            {
              type: 'separator',
              margin: 'md',
              color: COLORS.border
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '총 매출', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: formatSalesMoney(summary.total_sales), size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '거래 병원 수', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: `${summary.hospital_count}개`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'sm'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '거래 품목 수', size: 'sm', color: COLORS.subtext },
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
      layout: 'horizontal',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '6개월 보기',
            data: JSON.stringify({
              action: 'cso_period',
              period_months: 6,
              context: { cso_cd: cso.cso_cd }
            })
          },
          style: 'primary',
          height: 'sm',
          color: COLORS.navy
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '1년 보기',
            data: JSON.stringify({
              action: 'cso_period',
              period_months: 12,
              context: { cso_cd: cso.cso_cd }
            })
          },
          style: 'primary',
          height: 'sm',
          color: COLORS.navy
        }
      ],
      spacing: 'sm',
      backgroundColor: COLORS.darkNavy,
      paddingAll: '8px'
    }
  };

  // 병원 상세 버블
  const hospitalBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          size: 'sm',
          weight: 'bold',
          color: COLORS.white,
          align: 'center'
        }
      ],
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
            {
              type: 'text',
              text: 'TOP 병원별 매출',
              size: 'md',
              color: COLORS.text,
              weight: 'bold',
              align: 'center'
            },
            {
              type: 'text',
              text: periodText,
              size: 'xs',
              color: COLORS.lightGray,
              align: 'center',
              margin: 'sm'
            },
            {
              type: 'separator',
              margin: 'md',
              color: COLORS.border
            },
            ...hospitalContents.length > 0 ? hospitalContents : [
              { type: 'text', text: '데이터가 없습니다', size: 'sm', color: COLORS.lightGray, align: 'center', margin: 'md' }
            ]
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
      contents: [
        {
          type: 'text',
          text: '아주바이오 매출조회',
          size: 'xxs',
          color: COLORS.white,
          align: 'center'
        }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '6px'
    }
  };

  // 품목 상세 버블
  const drugBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          size: 'sm',
          weight: 'bold',
          color: COLORS.white,
          align: 'center'
        }
      ],
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
            {
              type: 'text',
              text: 'TOP 품목별 매출',
              size: 'md',
              color: COLORS.text,
              weight: 'bold',
              align: 'center'
            },
            {
              type: 'text',
              text: periodText,
              size: 'xs',
              color: COLORS.lightGray,
              align: 'center',
              margin: 'sm'
            },
            {
              type: 'separator',
              margin: 'md',
              color: COLORS.border
            },
            ...drugContents.length > 0 ? drugContents : [
              { type: 'text', text: '데이터가 없습니다', size: 'sm', color: COLORS.lightGray, align: 'center', margin: 'md' }
            ]
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
      contents: [
        {
          type: 'text',
          text: '아주바이오 매출조회',
          size: 'xxs',
          color: COLORS.white,
          align: 'center'
        }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '6px'
    }
  };

  return {
    type: 'carousel',
    contents: [mainBubble, hospitalBubble, drugBubble]
  };
}

/**
 * CSO 상세 캐러셀 생성 (6개월/1년용)
 * - 6개월: 품목별로 6개월 추이 + 평균
 * - 1년: 품목별로 시작매출 → 최근매출 (기간 표시) + 평균
 */
export function createCsoPeriodCarousel(result: CsoSalesResult): any {
  const { cso, summary, monthlySales, topHospitals, topDrugs, periodMonths, periodText } = result;
  const monthlyAvg = summary.total_sales / periodMonths;

  // 제목 (딜러명 + 법인명)
  const csoTitle = cso.cso_corp_nm
    ? `${cso.cso_dealer_nm} (${cso.cso_corp_nm})`
    : cso.cso_dealer_nm;

  // 6개월용 품목별 컨텐츠
  const createDrug6MonthContents = (drugs: DrugSalesData[]) => {
    return drugs.map((drug) => ({
      type: 'box',
      layout: 'vertical',
      contents: [
        // 1행: 품목명 + 평균
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: formatDrugName(drug.drug_name), size: 'sm', color: COLORS.text, weight: 'bold', flex: 3, wrap: true },
            { type: 'text', text: formatMonthlyAvg(drug.monthlySales), size: 'sm', weight: 'bold', color: COLORS.text, align: 'end', flex: 1 }
          ]
        },
        // 2행: 월별 추이
        {
          type: 'text',
          text: formatDrugMonthlyTrend(drug.monthlySales),
          size: 'xs',
          color: COLORS.subtext,
          margin: 'sm'
        }
      ],
      margin: 'lg'
    }));
  };

  // 1년용 품목별 컨텐츠
  const createDrug12MonthContents = (drugs: DrugSalesData[]) => {
    return drugs.map((drug) => {
      const sales = drug.monthlySales;
      const hasData = sales.length > 0;
      const firstSales = hasData ? sales[0] : 0;
      const lastSales = hasData ? sales[sales.length - 1] : 0;

      return {
        type: 'box',
        layout: 'vertical',
        contents: [
          // 1행: 품목명 + 평균
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: formatDrugName(drug.drug_name), size: 'sm', color: COLORS.text, weight: 'bold', flex: 3, wrap: true },
              { type: 'text', text: formatMonthlyAvg(drug.monthlySales), size: 'sm', weight: 'bold', color: COLORS.text, align: 'end', flex: 1 }
            ]
          },
          // 2행: 시작매출 → 최근매출
          {
            type: 'text',
            text: hasData
              ? `${Math.round(firstSales / 1000000)} → ${Math.round(lastSales / 1000000)} (${sales.length}개월)`
              : '데이터 없음',
            size: 'xs',
            color: COLORS.subtext,
            margin: 'sm'
          }
        ],
        margin: 'lg'
      };
    });
  };

  // 기간에 따라 다른 컨텐츠 생성
  const drugContents = periodMonths <= 6
    ? createDrug6MonthContents(topDrugs)
    : createDrug12MonthContents(topDrugs);

  // 병원별 매출 컨텐츠
  const hospitalContents: any[] = topHospitals.map((hospital, index) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: `${index + 1}. ${hospital.hos_abbr || hospital.hos_name}`,
        size: 'xs',
        color: COLORS.subtext,
        flex: 3,
        wrap: true
      },
      {
        type: 'text',
        text: formatSalesMoney(hospital.total_sales),
        size: 'xs',
        weight: 'bold',
        color: COLORS.text,
        align: 'end',
        flex: 2
      }
    ],
    margin: 'md'
  }));

  // 메인 버블
  const mainBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          size: 'sm',
          weight: 'bold',
          color: COLORS.white,
          align: 'center'
        }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '8px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'image',
          url: LOGO_URL,
          aspectRatio: '5:3',
          size: 'sm',
          aspectMode: 'fit'
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: csoTitle,
              size: 'md',
              color: COLORS.text,
              weight: 'bold',
              align: 'center',
              wrap: true
            },
            {
              type: 'text',
              text: `${periodText} (${periodMonths}개월)`,
              size: 'xs',
              color: COLORS.lightGray,
              align: 'center',
              margin: 'sm'
            },
            {
              type: 'separator',
              margin: 'md',
              color: COLORS.border
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '월평균 매출', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'md',
              color: COLORS.border
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '총 매출', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: formatSalesMoney(summary.total_sales), size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '거래 병원 수', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: `${summary.hospital_count}개`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'sm'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '거래 품목 수', size: 'sm', color: COLORS.subtext },
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
      layout: 'horizontal',
      contents: periodMonths === 6
        ? [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: '3개월 보기',
                data: JSON.stringify({
                  action: 'cso_period',
                  period_months: 3,
                  context: { cso_cd: cso.cso_cd }
                })
              },
              style: 'primary',
              height: 'sm',
              color: COLORS.navy
            },
            {
              type: 'button',
              action: {
                type: 'postback',
                label: '1년 보기',
                data: JSON.stringify({
                  action: 'cso_period',
                  period_months: 12,
                  context: { cso_cd: cso.cso_cd }
                })
              },
              style: 'primary',
              height: 'sm',
              color: COLORS.navy
            }
          ]
        : [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: '3개월 보기',
                data: JSON.stringify({
                  action: 'cso_period',
                  period_months: 3,
                  context: { cso_cd: cso.cso_cd }
                })
              },
              style: 'primary',
              height: 'sm',
              color: COLORS.navy
            },
            {
              type: 'button',
              action: {
                type: 'postback',
                label: '6개월 보기',
                data: JSON.stringify({
                  action: 'cso_period',
                  period_months: 6,
                  context: { cso_cd: cso.cso_cd }
                })
              },
              style: 'primary',
              height: 'sm',
              color: COLORS.navy
            }
          ],
      spacing: 'sm',
      backgroundColor: COLORS.darkNavy,
      paddingAll: '8px'
    }
  };

  // 병원 상세 버블
  const hospitalBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          size: 'sm',
          weight: 'bold',
          color: COLORS.white,
          align: 'center'
        }
      ],
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
            {
              type: 'text',
              text: `TOP 병원별 매출 (${periodMonths}개월)`,
              size: 'md',
              color: COLORS.text,
              weight: 'bold',
              align: 'center'
            },
            {
              type: 'text',
              text: periodText,
              size: 'xs',
              color: COLORS.lightGray,
              align: 'center',
              margin: 'sm'
            },
            {
              type: 'separator',
              margin: 'md',
              color: COLORS.border
            },
            ...hospitalContents.length > 0 ? hospitalContents : [
              { type: 'text', text: '데이터가 없습니다', size: 'sm', color: COLORS.lightGray, align: 'center', margin: 'md' }
            ]
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
      contents: [
        {
          type: 'text',
          text: '아주바이오 매출조회',
          size: 'xxs',
          color: COLORS.white,
          align: 'center'
        }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '6px'
    }
  };

  // 품목 상세 버블
  const drugBubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          size: 'sm',
          weight: 'bold',
          color: COLORS.white,
          align: 'center'
        }
      ],
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
            {
              type: 'text',
              text: `TOP 품목별 매출 (${periodMonths}개월)`,
              size: 'md',
              color: COLORS.text,
              weight: 'bold',
              align: 'center'
            },
            {
              type: 'text',
              text: periodText,
              size: 'xs',
              color: COLORS.lightGray,
              align: 'center',
              margin: 'sm'
            },
            {
              type: 'separator',
              margin: 'md',
              color: COLORS.border
            },
            ...drugContents.length > 0 ? drugContents : [
              { type: 'text', text: '데이터가 없습니다', size: 'sm', color: COLORS.lightGray, align: 'center', margin: 'md' }
            ]
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
      contents: [
        {
          type: 'text',
          text: '아주바이오 매출조회',
          size: 'xxs',
          color: COLORS.white,
          align: 'center'
        }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '6px'
    }
  };

  return {
    type: 'carousel',
    contents: [mainBubble, hospitalBubble, drugBubble]
  };
}
