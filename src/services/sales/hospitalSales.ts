/**
 * 병원 상세 매출 조회 서비스
 */

import { getConnection } from '../database/connection';
import sql from 'mssql';

// 색상 팔레트
const COLORS = {
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

interface DrugSalesData {
  drug_cd: string;
  drug_name: string;
  total_sales: number;
}

interface HospitalInfo {
  hos_cd: string;
  hos_cso_cd: string;
  hos_name: string;
  hos_abbr: string | null;
  hosIndex: string;
}

export interface HospitalSalesResult {
  hospital: HospitalInfo;
  summary: {
    total_sales: number;
    drug_count: number;
  };
  monthlySales: MonthlySalesData[];
  topDrugs: DrugSalesData[];
  periodMonths: number;
  periodText: string;
}

/**
 * 병원 상세 매출 조회
 */
export async function getHospitalSales(hos_cd: string, hos_cso_cd: string): Promise<HospitalSalesResult | null> {
  const pool = await getConnection();

  // 병원 기본 정보 조회
  const hospitalInfoResult = await pool.request()
    .input('hos_cd', sql.NVarChar, hos_cd)
    .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
    .query(`
      SELECT hos_cd, hos_cso_cd, hos_name, hos_abbr, hosIndex
      FROM HOSPITAL_TBL
      WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
    `);

  if (hospitalInfoResult.recordset.length === 0) {
    return null;
  }

  const hospital = hospitalInfoResult.recordset[0] as HospitalInfo;

  // 데이터 범위 확인
  const dataRangeResult = await pool.request()
    .input('hos_cd', sql.NVarChar, hos_cd)
    .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
    .query(`
      SELECT MIN(sales_index) AS min_index, MAX(sales_index) AS max_index
      FROM V_HOSPITAL_MONTHLY_SALES_byClaude
      WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
    `);

  const dataRange = dataRangeResult.recordset[0];
  if (!dataRange.max_index) {
    return null;
  }

  // 최근 3개월
  const endIndex = dataRange.max_index;
  const startIndex = Math.max(dataRange.min_index, endIndex - 2);
  const periodMonths = endIndex - startIndex + 1;

  const startYear = 2000 + Math.floor(startIndex / 12);
  const startMonth = (startIndex % 12) + 1;
  const endYear = 2000 + Math.floor(endIndex / 12);
  const endMonth = (endIndex % 12) + 1;
  const periodText = `${startYear}.${startMonth} ~ ${endYear}.${endMonth}`;

  // 병렬 쿼리 실행
  const [monthlyResult, drugResult] = await Promise.all([
    // 월별 매출
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT sales_year, sales_month, sales_index, SUM(total_sales) AS total_sales
        FROM V_HOSPITAL_MONTHLY_SALES_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY sales_year, sales_month, sales_index
        ORDER BY sales_index
      `),

    // TOP 품목
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT TOP 5 drug_cd, drug_name, SUM(total_sales) AS total_sales
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY drug_cd, drug_name
        ORDER BY SUM(total_sales) DESC
      `)
  ]);

  const monthlySales = monthlyResult.recordset as MonthlySalesData[];
  const topDrugs = drugResult.recordset as DrugSalesData[];

  const totalSales = monthlySales.reduce((sum, m) => sum + m.total_sales, 0);

  return {
    hospital,
    summary: {
      total_sales: totalSales,
      drug_count: topDrugs.length
    },
    monthlySales,
    topDrugs,
    periodMonths,
    periodText
  };
}

// 금액 포맷
function formatMoney(amount: number): string {
  const millions = amount / 1000000;
  if (millions >= 10) {
    return `${millions.toFixed(1)}백만`;
  } else if (millions >= 1) {
    return `${millions.toFixed(1)}백만`;
  } else if (millions >= 0.1) {
    return `${millions.toFixed(2)}백만`;
  } else {
    return `${(amount / 10000).toFixed(0)}만`;
  }
}

// 월별 추이 문자열
function formatMonthlyTrend(monthlySales: MonthlySalesData[]): string {
  if (monthlySales.length === 0) return '';
  return monthlySales
    .map(m => (m.total_sales / 1000000).toFixed(1))
    .join(' → ');
}

/**
 * 병원 상세 캐러셀 생성
 */
export function createHospitalCarousel(result: HospitalSalesResult): any {
  const { hospital, summary, monthlySales, topDrugs, periodMonths, periodText } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
  const trendText = formatMonthlyTrend(monthlySales);

  // 품목별 매출 컨텐츠
  const drugContents: any[] = topDrugs.map((drug, index) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: `${index + 1}. ${drug.drug_name}`, size: 'xs', color: COLORS.subtext, flex: 3, wrap: true },
      { type: 'text', text: formatMoney(drug.total_sales), size: 'xs', weight: 'bold', color: COLORS.text, align: 'end', flex: 2 }
    ],
    margin: 'md'
  }));

  // 메인 버블
  const mainBubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'image',
          url: LOGO_URL,
          aspectRatio: '5:3',
          size: 'md',
          aspectMode: 'fit'
        },
        {
          type: 'text',
          text: hospital.hos_abbr || hospital.hos_name,
          size: 'lg',
          color: COLORS.text,
          weight: 'bold',
          align: 'center',
          margin: 'xl',
          wrap: true
        },
        {
          type: 'text',
          text: `${hospital.hosIndex} | ${periodText} (${periodMonths}개월)`,
          size: 'xs',
          color: COLORS.lightGray,
          align: 'center',
          margin: 'sm'
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '월평균 매출', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: formatMoney(monthlyAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
              ]
            },
            {
              type: 'text',
              text: `(${trendText})`,
              size: 'xs',
              color: COLORS.subtext,
              align: 'end',
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'lg',
              color: COLORS.border
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '총 매출', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: formatMoney(summary.total_sales), size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '거래 품목 수', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: `${summary.drug_count}개`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'md'
            }
          ],
          paddingAll: '15px',
          margin: 'lg',
          backgroundColor: COLORS.white,
          cornerRadius: '10px'
        }
      ],
      backgroundColor: COLORS.background,
      paddingBottom: '15px'
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
              action: 'hospital_period',
              period_months: 6,
              context: { hos_cd: hospital.hos_cd, hos_cso_cd: hospital.hos_cso_cd }
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
              action: 'hospital_period',
              period_months: 12,
              context: { hos_cd: hospital.hos_cd, hos_cso_cd: hospital.hos_cso_cd }
            })
          },
          style: 'primary',
          height: 'sm',
          color: COLORS.navy
        }
      ],
      spacing: 'sm'
    }
  };

  // 품목 상세 버블
  const drugBubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'TOP 품목별 매출',
          size: 'lg',
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
          type: 'box',
          layout: 'vertical',
          contents: drugContents.length > 0 ? drugContents : [
            { type: 'text', text: '데이터가 없습니다', size: 'sm', color: COLORS.lightGray, align: 'center' }
          ],
          paddingAll: '15px',
          margin: 'lg',
          backgroundColor: COLORS.white,
          cornerRadius: '10px'
        }
      ],
      backgroundColor: COLORS.background,
      paddingBottom: '15px'
    }
  };

  return {
    type: 'carousel',
    contents: [mainBubble, drugBubble]
  };
}
