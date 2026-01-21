/**
 * 약품 상세 매출 조회 서비스
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

interface HospitalSalesData {
  hos_cd: string;
  hos_cso_cd: string;
  hos_name: string;
  hos_abbr: string | null;
  total_sales: number;
}

interface DrugInfo {
  drug_cd: string;
  drug_name: string;
}

export interface DrugSalesResult {
  drug: DrugInfo;
  summary: {
    total_sales: number;
    hospital_count: number;
  };
  monthlySales: MonthlySalesData[];
  topHospitals: HospitalSalesData[];
  periodMonths: number;
  periodText: string;
}

/**
 * 약품 상세 매출 조회
 */
export async function getDrugSales(drug_cd: string): Promise<DrugSalesResult | null> {
  const pool = await getConnection();

  // 약품 기본 정보 조회
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

  // 데이터 범위 확인
  const dataRangeResult = await pool.request()
    .input('drug_cd', sql.NVarChar, drug_cd)
    .query(`
      SELECT MIN(sales_index) AS min_index, MAX(sales_index) AS max_index
      FROM V_DRUG_MONTHLY_SALES_byClaude
      WHERE drug_cd = @drug_cd
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
  const [monthlyResult, hospitalResult, hospitalCountResult] = await Promise.all([
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

    // TOP 병원
    pool.request()
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT TOP 5
          hd.hos_cd, hd.hos_cso_cd,
          h.hos_name, h.hos_abbr,
          SUM(hd.total_sales) AS total_sales
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude hd
        JOIN HOSPITAL_TBL h ON hd.hos_cd = h.hos_cd AND hd.hos_cso_cd = h.hos_cso_cd
        WHERE hd.drug_cd = @drug_cd
          AND hd.sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY hd.hos_cd, hd.hos_cso_cd, h.hos_name, h.hos_abbr
        ORDER BY SUM(hd.total_sales) DESC
      `),

    // 거래 병원 수
    pool.request()
      .input('drug_cd', sql.NVarChar, drug_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT COUNT(DISTINCT hos_cd + hos_cso_cd) AS hospital_count
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
        WHERE drug_cd = @drug_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
      `)
  ]);

  const monthlySales = monthlyResult.recordset as MonthlySalesData[];
  const topHospitals = hospitalResult.recordset as HospitalSalesData[];
  const hospitalCount = hospitalCountResult.recordset[0]?.hospital_count || 0;

  const totalSales = monthlySales.reduce((sum, m) => sum + m.total_sales, 0);

  return {
    drug,
    summary: {
      total_sales: totalSales,
      hospital_count: hospitalCount
    },
    monthlySales,
    topHospitals,
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
 * 약품 상세 캐러셀 생성
 */
export function createDrugCarousel(result: DrugSalesResult): any {
  const { drug, summary, monthlySales, topHospitals, periodMonths, periodText } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
  const trendText = formatMonthlyTrend(monthlySales);

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
        text: formatMoney(hospital.total_sales),
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
          text: drug.drug_name,
          size: 'lg',
          color: COLORS.text,
          weight: 'bold',
          align: 'center',
          margin: 'xl',
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
                { type: 'text', text: '거래 병원 수', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: `${summary.hospital_count}개`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
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
              action: 'drug_period',
              period_months: 6,
              context: { drug_cd: drug.drug_cd }
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
              action: 'drug_period',
              period_months: 12,
              context: { drug_cd: drug.drug_cd }
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

  // 병원 상세 버블
  const hospitalBubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'TOP 병원별 매출',
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
          contents: hospitalContents.length > 0 ? hospitalContents : [
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
    contents: [mainBubble, hospitalBubble]
  };
}
