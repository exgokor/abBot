/**
 * 지역 매출 조회 서비스
 */

import { getConnection } from '../database/connection';
import sql from 'mssql';

// 로고 URL (WorksMobile storage)
const LOGO_URL = 'https://storage.worksmobile.com/k1/drive/r/24101/300118260/300118260/@2001000000362831/3472530909344205321?fileId=QDIwMDEwMDAwMDAzNjI4MzF8MzQ3MjUzMDkwOTM0NDIwNTMyMXxGfDA&downloadType=O&resourceType=thumbnail&resourceFormat=origin&cache=1734582221372&conditionalAccessPolicy=false';

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

interface MonthlySalesData {
  sales_year: number;
  sales_month: number;
  sales_index: number;
  total_sales: number;
}

interface RegionSalesData {
  hosIndex: string;
  total_sales: number;
  hospital_count: number;
  drug_count: number;
  monthlySales: MonthlySalesData[];
}

interface DrugSalesData {
  drug_cd: string;
  drug_name: string;
  total_sales: number;
}

interface TopHospitalData {
  hos_cd: string;
  hos_cso_cd: string;
  hos_name: string;
  hos_abbr: string;
  total_sales: number;
  drug_count: number;
  monthlySales: MonthlySalesData[];
  drugSales: DrugSalesData[];
}

interface RegionDrugSalesData {
  drug_cd: string;
  drug_name: string;
  total_sales: number;
}

interface RegionSalesResult {
  summary: RegionSalesData;
  topHospitals: TopHospitalData[];
  topDrugs: RegionDrugSalesData[];
  periodMonths: number;
  periodText: string;
}

/**
 * DB에서 지역 데이터 존재 여부 확인
 */
export async function checkRegionExists(keyword: string): Promise<boolean> {
  if (keyword.length < 2) return false;

  const pool = await getConnection();
  const result = await pool.request()
    .input('keyword', sql.NVarChar, `${keyword}%`)
    .query(`
      SELECT TOP 1 1 AS exists_flag
      FROM V_REGION_MONTHLY_SALES_byClaude
      WHERE hosIndex LIKE @keyword
    `);

  return result.recordset.length > 0;
}

/**
 * 지역 매출 데이터 조회
 */
export async function getRegionSales(keyword: string): Promise<RegionSalesResult | null> {
  const pool = await getConnection();

  // 데이터 범위 확인
  const dataRangeResult = await pool.request()
    .input('keyword', sql.NVarChar, `${keyword}%`)
    .query(`
      SELECT
        MIN(sales_index) AS min_index,
        MAX(sales_index) AS max_index
      FROM V_REGION_MONTHLY_SALES_byClaude
      WHERE hosIndex LIKE @keyword
    `);

  const dataRange = dataRangeResult.recordset[0];
  if (!dataRange.max_index) {
    return null; // 데이터 없음
  }

  // 가장 최근 3개월
  const endIndex = dataRange.max_index;
  const startIndex = Math.max(dataRange.min_index, endIndex - 2);
  const periodMonths = endIndex - startIndex + 1;

  // 조회 기간 텍스트
  const startYear = 2000 + Math.floor(startIndex / 12);
  const startMonth = (startIndex % 12) + 1;
  const endYear = 2000 + Math.floor(endIndex / 12);
  const endMonth = (endIndex % 12) + 1;
  const periodText = `${startYear}.${startMonth} ~ ${endYear}.${endMonth}`;

  // 1. 지역 월별 매출
  const monthlyResult = await pool.request()
    .input('keyword', sql.NVarChar, `${keyword}%`)
    .input('startIndex', sql.Int, startIndex)
    .input('endIndex', sql.Int, endIndex)
    .query(`
      SELECT
        sales_year, sales_month, sales_index,
        SUM(total_sales) AS total_sales
      FROM V_REGION_MONTHLY_SALES_byClaude
      WHERE hosIndex LIKE @keyword
        AND sales_index BETWEEN @startIndex AND @endIndex
      GROUP BY sales_year, sales_month, sales_index
      ORDER BY sales_index
    `);

  // 2. 지역 요약
  const summaryResult = await pool.request()
    .input('keyword', sql.NVarChar, `${keyword}%`)
    .input('startIndex', sql.Int, startIndex)
    .input('endIndex', sql.Int, endIndex)
    .query(`
      SELECT
        LEFT(hosIndex, CHARINDEX(' ', hosIndex + ' ') - 1) AS hosIndex,
        SUM(total_sales) AS total_sales,
        SUM(hospital_count) AS hospital_count,
        SUM(drug_count) AS drug_count
      FROM V_REGION_MONTHLY_SALES_byClaude
      WHERE hosIndex LIKE @keyword
        AND sales_index BETWEEN @startIndex AND @endIndex
      GROUP BY LEFT(hosIndex, CHARINDEX(' ', hosIndex + ' ') - 1)
    `);

  // 3. TOP 5 병원
  const topHospitalsResult = await pool.request()
    .input('keyword', sql.NVarChar, `${keyword}%`)
    .input('startIndex', sql.Int, startIndex)
    .input('endIndex', sql.Int, endIndex)
    .query(`
      SELECT TOP 5
        hos_cd, hos_cso_cd, hos_name, hos_abbr,
        SUM(total_sales) AS total_sales,
        SUM(drug_count) AS drug_count
      FROM V_HOSPITAL_MONTHLY_SALES_byClaude
      WHERE hosIndex LIKE @keyword
        AND sales_index BETWEEN @startIndex AND @endIndex
      GROUP BY hos_cd, hos_cso_cd, hos_name, hos_abbr
      ORDER BY SUM(total_sales) DESC
    `);

  // 4. 지역 TOP 품목
  const topDrugsResult = await pool.request()
    .input('keyword', sql.NVarChar, `${keyword}%`)
    .input('startIndex', sql.Int, startIndex)
    .input('endIndex', sql.Int, endIndex)
    .query(`
      SELECT TOP 5
        drug_cd, drug_name,
        SUM(total_sales) AS total_sales
      FROM V_DRUG_MONTHLY_SALES_byClaude d
      WHERE EXISTS (
        SELECT 1 FROM V_HOSPITAL_MONTHLY_SALES_byClaude h
        WHERE h.hosIndex LIKE @keyword
          AND h.sales_index BETWEEN @startIndex AND @endIndex
      )
        AND d.sales_index BETWEEN @startIndex AND @endIndex
      GROUP BY drug_cd, drug_name
      ORDER BY SUM(total_sales) DESC
    `);

  // 5. 각 병원별 월별 매출 + 품목별 매출
  const hospitals: TopHospitalData[] = [];
  for (const h of topHospitalsResult.recordset) {
    const hospitalMonthlyResult = await pool.request()
      .input('hos_cd', sql.NVarChar, h.hos_cd)
      .input('hos_cso_cd', sql.NVarChar, h.hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT sales_year, sales_month, sales_index, SUM(total_sales) AS total_sales
        FROM V_HOSPITAL_MONTHLY_SALES_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY sales_year, sales_month, sales_index
        ORDER BY sales_index
      `);

    const drugSalesResult = await pool.request()
      .input('hos_cd', sql.NVarChar, h.hos_cd)
      .input('hos_cso_cd', sql.NVarChar, h.hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT drug_cd, drug_name, SUM(total_sales) AS total_sales
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY drug_cd, drug_name
        ORDER BY SUM(total_sales) DESC
      `);

    hospitals.push({
      ...h,
      monthlySales: hospitalMonthlyResult.recordset,
      drugSales: drugSalesResult.recordset
    });
  }

  const summaryData = summaryResult.recordset[0] || {
    hosIndex: keyword,
    total_sales: 0,
    hospital_count: 0,
    drug_count: 0
  };

  return {
    summary: {
      ...summaryData,
      monthlySales: monthlyResult.recordset
    },
    topHospitals: hospitals,
    topDrugs: topDrugsResult.recordset,
    periodMonths,
    periodText
  };
}

// 금액 포맷: X.X백만
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

// 금액 포맷: 정수 백만
function formatMoneyInt(amount: number): string {
  const millions = Math.round(amount / 1000000);
  return `${millions}백만`;
}

// 월별 추이 문자열
function formatMonthlyTrend(monthlySales: MonthlySalesData[]): string {
  if (monthlySales.length === 0) return '';
  return monthlySales
    .map(m => (m.total_sales / 1000000).toFixed(1))
    .join(' → ');
}

/**
 * 지역 매출 캐러셀 메시지 생성
 */
export function createRegionCarousel(
  keyword: string,
  result: RegionSalesResult
): any {
  const { summary, topHospitals, topDrugs, periodMonths, periodText } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
  const trendText = formatMonthlyTrend(summary.monthlySales);

  // 요약 버블
  const summaryBubble = {
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
          text: `${keyword} 지역 실적현황`,
          size: 'lg',
          color: COLORS.text,
          weight: 'bold',
          align: 'center',
          margin: 'xl'
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
                { type: 'text', text: '거래 병원', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: `${summary.hospital_count}개`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'lg'
            },
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
            label: 'TOP5 병원',
            data: JSON.stringify({
              action: 'drill_down',
              type: 'top_hospitals',
              limit: 5,
              context: { region: keyword, period_months: periodMonths }
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
            label: 'TOP5 품목',
            data: JSON.stringify({
              action: 'drill_down',
              type: 'top_drugs',
              limit: 5,
              context: { region: keyword, period_months: periodMonths }
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

  // TOP3 병원 버블들
  const hospitalBubbles = topHospitals.slice(0, 3).map((hospital, index) => {
    const hospitalAvg = hospital.total_sales / periodMonths;
    const hospitalTrend = formatMonthlyTrend(hospital.monthlySales);

    const top3Drugs = hospital.drugSales.slice(0, 3);
    const otherDrugs = hospital.drugSales.slice(3);
    const otherTotal = otherDrugs.reduce((sum, d) => sum + d.total_sales, 0);

    const drugContents: any[] = top3Drugs.map(drug => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: `• ${drug.drug_name}`, size: 'xs', color: COLORS.subtext, flex: 3, wrap: true },
        { type: 'text', text: formatMoney(drug.total_sales), size: 'xs', weight: 'bold', color: COLORS.text, align: 'end', flex: 2 }
      ],
      margin: 'md'
    }));

    if (otherDrugs.length > 0) {
      drugContents.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `• 기타 ${otherDrugs.length}품목`, size: 'xs', color: COLORS.lightGray, flex: 3 },
          { type: 'text', text: formatMoney(otherTotal), size: 'xs', weight: 'bold', color: COLORS.subtext, align: 'end', flex: 2 }
        ],
        margin: 'md'
      });
    }

    return {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'image',
            url: LOGO_URL,
            aspectRatio: '5:3',
            size: 'full',
            aspectMode: 'fit'
          },
          {
            type: 'text',
            text: `${index + 1}위 ${hospital.hos_abbr || hospital.hos_name}`,
            size: 'lg',
            color: COLORS.text,
            weight: 'bold',
            align: 'center',
            margin: 'xl',
            wrap: true
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
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '월평균', size: 'sm', color: COLORS.subtext },
                  { type: 'text', text: formatMoney(hospitalAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
                ]
              },
              {
                type: 'text',
                text: `(${hospitalTrend})`,
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
                type: 'text',
                text: '품목별 매출',
                size: 'xs',
                color: COLORS.subtext,
                margin: 'lg'
              },
              {
                type: 'box',
                layout: 'vertical',
                contents: drugContents,
                margin: 'sm'
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
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'postback',
              label: '상세보기',
              data: JSON.stringify({
                action: 'drill_down',
                type: 'hospital_detail',
                context: {
                  hos_cd: hospital.hos_cd,
                  hos_cso_cd: hospital.hos_cso_cd,
                  hos_name: hospital.hos_name,
                  region: keyword,
                  period_months: periodMonths
                }
              })
            },
            style: 'primary',
            height: 'sm',
            color: COLORS.navy
          }
        ]
      }
    };
  });

  // 마지막 버블: 요약 + 기간변경
  const drugSummaryContents: any[] = topDrugs.slice(0, 3).map(drug => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: drug.drug_name, size: 'xs', color: COLORS.subtext, flex: 4, wrap: true },
      { type: 'text', text: formatMoneyInt(drug.total_sales), size: 'xs', weight: 'bold', color: COLORS.text, align: 'end', flex: 2 },
      {
        type: 'text',
        text: '더보기',
        size: 'xxs',
        color: COLORS.navy,
        align: 'end',
        flex: 2,
        decoration: 'underline',
        action: {
          type: 'postback',
          label: '더보기',
          data: JSON.stringify({
            action: 'drill_down',
            type: 'drug_region_detail',
            context: {
              drug_cd: drug.drug_cd,
              drug_name: drug.drug_name,
              region: keyword,
              period_months: periodMonths
            }
          })
        }
      }
    ],
    margin: 'lg'
  }));

  const summaryPeriodBubble = {
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
          text: `${keyword} 지역 요약`,
          weight: 'bold',
          size: 'lg',
          color: COLORS.text,
          align: 'center',
          margin: 'xl'
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
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '주요 품목별 매출', size: 'sm', weight: 'bold', color: COLORS.text, flex: 4 },
                { type: 'text', text: '매출', size: 'xxs', color: COLORS.subtext, align: 'end', flex: 2 },
                { type: 'text', text: ' ', size: 'xxs', flex: 2 }
              ]
            },
            {
              type: 'separator',
              margin: 'md',
              color: COLORS.border
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: drugSummaryContents,
              margin: 'sm'
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
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '6개월 보기',
            data: JSON.stringify({
              action: 'change_period',
              period_months: 6,
              context: { region: keyword }
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
              action: 'change_period',
              period_months: 12,
              context: { region: keyword }
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

  return {
    type: 'carousel',
    contents: [summaryBubble, ...hospitalBubbles, summaryPeriodBubble]
  };
}
