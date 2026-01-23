/**
 * 지역 매출 조회 서비스
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
  monthlySales: number[];  // 월별 매출 배열
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
 * 지역 매출 데이터 조회 (최적화 버전)
 * - N+1 쿼리 제거: 병원별 데이터를 단일 쿼리로 조회
 * - 병렬 쿼리 실행: Promise.all 사용
 * - 정확한 병원/품목 수: COUNT DISTINCT 사용
 */
/**
 * 지역 매출 데이터 조회
 * @param keyword 지역 키워드
 * @param requestedMonths 요청 기간 (3, 6, 12개월). 기본값 3
 */
export async function getRegionSales(keyword: string, requestedMonths: number = 3): Promise<RegionSalesResult | null> {
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

  // 요청된 기간만큼 조회 (실제 데이터 범위 내에서)
  const endIndex = dataRange.max_index;
  const startIndex = Math.max(dataRange.min_index, endIndex - (requestedMonths - 1));
  const periodMonths = endIndex - startIndex + 1;

  // 조회 기간 텍스트
  const startYear = 2000 + Math.floor(startIndex / 12);
  const startMonth = (startIndex % 12) + 1;
  const endYear = 2000 + Math.floor(endIndex / 12);
  const endMonth = (endIndex % 12) + 1;
  const periodText = `${startYear}.${startMonth} ~ ${endYear}.${endMonth}`;

  // === 병렬 쿼리 실행 (1차) ===
  const [monthlyResult, summaryCountResult, topHospitalsResult, topDrugsResult, topDrugsMonthlyResult] = await Promise.all([
    // 1. 지역 월별 매출
    pool.request()
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
      `),

    // 2. 지역 요약 (정확한 COUNT DISTINCT - 새 뷰 사용)
    pool.request()
      .input('keyword', sql.NVarChar, `${keyword}%`)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT
          COUNT(DISTINCT hos_cd + hos_cso_cd) AS hospital_count,
          COUNT(DISTINCT drug_cd) AS drug_count,
          SUM(sales_amount) AS total_sales
        FROM V_REGION_SUMMARY_byClaude
        WHERE hosIndex LIKE @keyword
          AND sales_index BETWEEN @startIndex AND @endIndex
      `),

    // 3. TOP 5 병원
    pool.request()
      .input('keyword', sql.NVarChar, `${keyword}%`)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT TOP 5
          hos_cd, hos_cso_cd, hos_name, hos_abbr,
          SUM(total_sales) AS total_sales,
          COUNT(DISTINCT CASE WHEN drug_count > 0 THEN sales_index END) AS month_count
        FROM V_HOSPITAL_MONTHLY_SALES_byClaude
        WHERE hosIndex LIKE @keyword
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY hos_cd, hos_cso_cd, hos_name, hos_abbr
        ORDER BY SUM(total_sales) DESC
      `),

    // 4. 지역 TOP 품목 (수정: 지역 필터링 적용)
    pool.request()
      .input('keyword', sql.NVarChar, `${keyword}%`)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT TOP 5
          drug_cd, drug_name,
          SUM(total_sales) AS total_sales
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
        WHERE hosIndex LIKE @keyword
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY drug_cd, drug_name
        ORDER BY SUM(total_sales) DESC
      `),

    // 5. TOP 5 품목별 월별 매출
    pool.request()
      .input('keyword', sql.NVarChar, `${keyword}%`)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT drug_cd, drug_name, sales_index, SUM(total_sales) AS total_sales
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
        WHERE hosIndex LIKE @keyword
          AND sales_index BETWEEN @startIndex AND @endIndex
          AND drug_cd IN (
            SELECT TOP 5 drug_cd
            FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
            WHERE hosIndex LIKE @keyword
              AND sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY drug_cd
            ORDER BY SUM(total_sales) DESC
          )
        GROUP BY drug_cd, drug_name, sales_index
        ORDER BY drug_cd, sales_index
      `)
  ]);

  // TOP 품목 월별 데이터 조합
  const drugTotals = topDrugsResult.recordset as { drug_cd: string; drug_name: string; total_sales: number }[];
  const drugMonthlyData = topDrugsMonthlyResult.recordset as { drug_cd: string; drug_name: string; sales_index: number; total_sales: number }[];

  // drug_cd별로 월별 매출 배열 생성
  const topDrugsWithMonthly: RegionDrugSalesData[] = drugTotals.map(drug => {
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

  // TOP 5 병원 목록 추출
  const topHospitalsList = topHospitalsResult.recordset;
  if (topHospitalsList.length === 0) {
    // 병원이 없으면 빈 결과 반환
    const summaryCount = summaryCountResult.recordset[0] || { hospital_count: 0, drug_count: 0, total_sales: 0 };
    return {
      summary: {
        hosIndex: keyword,
        total_sales: summaryCount.total_sales || 0,
        hospital_count: summaryCount.hospital_count || 0,
        drug_count: summaryCount.drug_count || 0,
        monthlySales: monthlyResult.recordset
      },
      topHospitals: [],
      topDrugs: topDrugsWithMonthly,
      periodMonths,
      periodText
    };
  }

  // === 병렬 쿼리 실행 (2차) - N+1 제거: 모든 병원 데이터를 한번에 조회 ===
  const hospitalKeys = topHospitalsList.map(h => `'${h.hos_cd}|${h.hos_cso_cd}'`).join(',');

  const [allHospitalMonthlyResult, allHospitalDrugResult] = await Promise.all([
    // 5. 모든 TOP 병원의 월별 매출 (한번에 조회)
    pool.request()
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT hos_cd, hos_cso_cd, sales_year, sales_month, sales_index, SUM(total_sales) AS total_sales
        FROM V_HOSPITAL_MONTHLY_SALES_byClaude
        WHERE hos_cd + '|' + hos_cso_cd IN (${hospitalKeys})
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY hos_cd, hos_cso_cd, sales_year, sales_month, sales_index
        ORDER BY hos_cd, hos_cso_cd, sales_index
      `),

    // 6. 모든 TOP 병원의 품목별 매출 (한번에 조회)
    pool.request()
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT hos_cd, hos_cso_cd, drug_cd, drug_name, SUM(total_sales) AS total_sales
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
        WHERE hos_cd + '|' + hos_cso_cd IN (${hospitalKeys})
          AND sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY hos_cd, hos_cso_cd, drug_cd, drug_name
        ORDER BY hos_cd, hos_cso_cd, SUM(total_sales) DESC
      `)
  ]);

  // 결과를 병원별로 그룹핑
  const hospitalMonthlyMap = new Map<string, MonthlySalesData[]>();
  const hospitalDrugMap = new Map<string, DrugSalesData[]>();

  for (const row of allHospitalMonthlyResult.recordset) {
    const key = `${row.hos_cd}|${row.hos_cso_cd}`;
    if (!hospitalMonthlyMap.has(key)) {
      hospitalMonthlyMap.set(key, []);
    }
    hospitalMonthlyMap.get(key)!.push({
      sales_year: row.sales_year,
      sales_month: row.sales_month,
      sales_index: row.sales_index,
      total_sales: row.total_sales
    });
  }

  for (const row of allHospitalDrugResult.recordset) {
    const key = `${row.hos_cd}|${row.hos_cso_cd}`;
    if (!hospitalDrugMap.has(key)) {
      hospitalDrugMap.set(key, []);
    }
    hospitalDrugMap.get(key)!.push({
      drug_cd: row.drug_cd,
      drug_name: row.drug_name,
      total_sales: row.total_sales
    });
  }

  // 병원 데이터 조립
  const hospitals: TopHospitalData[] = topHospitalsList.map(h => {
    const key = `${h.hos_cd}|${h.hos_cso_cd}`;
    return {
      hos_cd: h.hos_cd,
      hos_cso_cd: h.hos_cso_cd,
      hos_name: h.hos_name,
      hos_abbr: h.hos_abbr,
      total_sales: h.total_sales,
      drug_count: hospitalDrugMap.get(key)?.length || 0,
      monthlySales: hospitalMonthlyMap.get(key) || [],
      drugSales: hospitalDrugMap.get(key) || []
    };
  });

  const summaryCount = summaryCountResult.recordset[0] || { hospital_count: 0, drug_count: 0, total_sales: 0 };

  return {
    summary: {
      hosIndex: keyword,
      total_sales: summaryCount.total_sales || 0,
      hospital_count: summaryCount.hospital_count || 0,
      drug_count: summaryCount.drug_count || 0,
      monthlySales: monthlyResult.recordset
    },
    topHospitals: hospitals,
    topDrugs: topDrugsWithMonthly,
    periodMonths,
    periodText
  };
}

// MonthlySalesData 배열을 숫자 배열로 변환하여 포맷팅
function formatMonthlyTrend(monthlySales: MonthlySalesData[]): string {
  return formatTrend(monthlySales.map(m => m.total_sales));
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
                { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
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
        { type: 'text', text: `• ${formatDrugName(drug.drug_name)}`, size: 'xs', color: COLORS.subtext, flex: 3, wrap: true },
        { type: 'text', text: formatSalesMoney(drug.total_sales), size: 'xs', weight: 'bold', color: COLORS.text, align: 'end', flex: 2 }
      ],
      margin: 'md'
    }));

    if (otherDrugs.length > 0) {
      drugContents.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `• 기타 ${otherDrugs.length}품목`, size: 'xs', color: COLORS.lightGray, flex: 3 },
          { type: 'text', text: formatSalesMoney(otherTotal), size: 'xs', weight: 'bold', color: COLORS.subtext, align: 'end', flex: 2 }
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
                  { type: 'text', text: formatSalesMoney(hospitalAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
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

  // 마지막 버블: 요약 + 기간변경 (새 포맷: 품목명 + 월별추이 + 월평균)
  const drugSummaryContents: any[] = topDrugs.slice(0, 3).map(drug => ({
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

/**
 * 지역 매출 캐러셀 생성 (6개월/1년용)
 * - 6개월: 품목별로 6개월 추이 + 평균
 * - 1년: 품목별로 시작매출 → 최근매출 (기간 표시) + 평균
 */
export function createRegionPeriodCarousel(
  keyword: string,
  result: RegionSalesResult
): any {
  const { summary, topDrugs, periodMonths, periodText } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
  const trendText = formatMonthlyTrend(summary.monthlySales);

  // 6개월용 품목별 컨텐츠
  const createDrug6MonthContents = (drugs: RegionDrugSalesData[]) => {
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
  const createDrug12MonthContents = (drugs: RegionDrugSalesData[]) => {
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
                { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
              ]
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
      contents: periodMonths === 6
        ? [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: '3개월 보기',
                data: JSON.stringify({
                  action: 'change_period',
                  period_months: 3,
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
          ]
        : [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: '3개월 보기',
                data: JSON.stringify({
                  action: 'change_period',
                  period_months: 3,
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
          text: `TOP 품목별 매출 (${periodMonths}개월)`,
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
    contents: [summaryBubble, drugBubble]
  };
}
