/**
 * 병원 상세 매출 조회 서비스
 */

import { getConnection } from '../database/connection';
import sql from 'mssql';
import { formatDrugName } from '../../utils/drugNameFormatter';
import {
  formatSalesMoney,
  formatMonthlyTrend,
  formatYearlyTrend,
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

interface DrugSalesData {
  drug_cd: string;
  drug_name: string;
  total_sales: number;
  monthlySales: number[];  // 월별 매출 배열
}

interface HospitalInfo {
  hos_cd: string;
  hos_cso_cd: string;
  hos_name: string;
  hos_abbr: string | null;
  hosIndex: string;
}

interface BlockInfo {
  drug_cd: string;
  drug_name: string;
  cso_cd: string;
  cso_dealer_nm: string;
  disease_type: string | null;
}

interface CsoMonthlySales {
  cso_cd: string;
  cso_dealer_nm: string;
  monthlySales: number[];
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
  startIndex: number;
  blocks: BlockInfo[];
  csoSales: CsoMonthlySales[];
}

/**
 * 병원 상세 매출 조회
 * @param hos_cd 병원 코드
 * @param hos_cso_cd 병원 CSO 코드
 * @param requestedMonths 요청 기간 (3, 6, 12개월). 기본값 3
 */
export async function getHospitalSales(hos_cd: string, hos_cso_cd: string, requestedMonths: number = 3): Promise<HospitalSalesResult | null> {
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
  const [monthlyResult, drugResult, drugMonthlyResult, blocksResult, csoSalesResult] = await Promise.all([
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

    // TOP 품목 (총합)
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
      `),

    // TOP 5 품목별 월별 매출
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT drug_cd, drug_name, sales_index, total_sales
        FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
          AND sales_index BETWEEN @startIndex AND @endIndex
          AND drug_cd IN (
            SELECT TOP 5 drug_cd
            FROM V_HOSPITAL_DRUG_MONTHLY_byClaude
            WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
              AND sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY drug_cd
            ORDER BY SUM(total_sales) DESC
          )
        ORDER BY drug_cd, sales_index
      `),

    // 블록 현황 조회
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .query(`
        SELECT drug_cd, drug_name, cso_cd, cso_dealer_nm, disease_type
        FROM V_CURRENT_BLOCKS_byClaude
        WHERE hos_cd = @hos_cd AND hos_cso_cd = @hos_cso_cd
        ORDER BY drug_name
      `),

    // CSO별 월별 매출 조회
    pool.request()
      .input('hos_cd', sql.NVarChar, hos_cd)
      .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
      .input('startIndex', sql.Int, startIndex)
      .input('endIndex', sql.Int, endIndex)
      .query(`
        SELECT
          s.cso_cd_then AS cso_cd,
          c.cso_dealer_nm,
          s.sales_index,
          SUM(s.drug_cnt * s.drug_price) AS total_sales
        FROM SALES_TBL s
        LEFT JOIN CSO_TBL c ON s.cso_cd_then = c.cso_cd
        WHERE s.hos_cd = @hos_cd
          AND s.hos_cso_cd = @hos_cso_cd
          AND s.sales_index BETWEEN @startIndex AND @endIndex
        GROUP BY s.cso_cd_then, c.cso_dealer_nm, s.sales_index
        ORDER BY c.cso_dealer_nm, s.sales_index
      `)
  ]);

  const monthlySales = monthlyResult.recordset as MonthlySalesData[];

  // 품목별 월별 매출 데이터를 조합
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

  // 블록 현황
  const blocks = blocksResult.recordset as BlockInfo[];

  // CSO별 월별 매출 집계
  const csoSalesData = csoSalesResult.recordset as { cso_cd: string; cso_dealer_nm: string; sales_index: number; total_sales: number }[];
  const csoMap = new Map<string, CsoMonthlySales>();

  for (const row of csoSalesData) {
    if (!csoMap.has(row.cso_cd)) {
      csoMap.set(row.cso_cd, {
        cso_cd: row.cso_cd,
        cso_dealer_nm: row.cso_dealer_nm || '미지정',
        monthlySales: []
      });
    }
    csoMap.get(row.cso_cd)!.monthlySales.push(row.total_sales);
  }
  const csoSales = Array.from(csoMap.values());

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
    periodText,
    startIndex,
    blocks,
    csoSales
  };
}


/**
 * 블록 현황 버블 생성
 */
function createBlockBubble(blocks: BlockInfo[], periodText: string): any {
  // 품목+CSO별로 그룹핑
  const groupedBlocks = new Map<string, { drug_name: string; cso_dealer_nm: string; diseases: Set<string> }>();

  for (const block of blocks) {
    const key = `${block.drug_cd}|${block.cso_cd}`;

    if (!groupedBlocks.has(key)) {
      groupedBlocks.set(key, {
        drug_name: block.drug_name,
        cso_dealer_nm: block.cso_dealer_nm,
        diseases: new Set()
      });
    }

    // 진료과 추가 (있으면)
    if (block.disease_type) {
      block.disease_type.split(',').forEach(d => {
        groupedBlocks.get(key)!.diseases.add(d.trim());
      });
    }
  }

  // 그룹핑된 데이터로 컨텐츠 생성
  const blockContents: any[] = Array.from(groupedBlocks.values()).map(group => {
    const diseases = Array.from(group.diseases).join(', ');

    return {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `${formatDrugName(group.drug_name)} - ${group.cso_dealer_nm}`,
          size: 'sm',
          color: COLORS.text,
          weight: 'bold',
          wrap: true
        },
        ...(diseases ? [{
          type: 'text',
          text: diseases,
          size: 'xs',
          color: COLORS.subtext,
          margin: 'sm',
          wrap: true
        }] : [])
      ],
      margin: 'lg'
    };
  });

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'AJUBIO', size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }
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
            { type: 'text', text: '블록 현황', size: 'md', color: COLORS.text, weight: 'bold', align: 'center' },
            { type: 'text', text: periodText, size: 'xs', color: COLORS.lightGray, align: 'center', margin: 'sm' },
            { type: 'separator', margin: 'md', color: COLORS.border },
            ...(blockContents.length > 0 ? blockContents : [
              { type: 'text', text: '블록 데이터가 없습니다', size: 'sm', color: COLORS.lightGray, align: 'center', margin: 'md' }
            ])
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
        { type: 'text', text: '아주바이오 매출조회', size: 'xxs', color: COLORS.white, align: 'center' }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '6px'
    }
  };
}

/**
 * CSO별 매출 버블 생성
 */
function createCsoBubble(csoSales: CsoMonthlySales[], periodMonths: number, periodText: string): any {
  const csoContents: any[] = csoSales.map(cso => {
    const trend = formatDrugMonthlyTrend(cso.monthlySales);
    const avg = formatMonthlyAvg(cso.monthlySales);

    return {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: cso.cso_dealer_nm, size: 'sm', color: COLORS.text, weight: 'bold' },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: trend, size: 'xs', color: COLORS.subtext, flex: 3 },
            { type: 'text', text: avg, size: 'xs', weight: 'bold', color: COLORS.text, align: 'end', flex: 1 }
          ],
          margin: 'sm'
        }
      ],
      margin: 'lg'
    };
  });

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'AJUBIO', size: 'sm', weight: 'bold', color: COLORS.white, align: 'center' }
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
            { type: 'text', text: `CSO별 매출 (${periodMonths}개월)`, size: 'md', color: COLORS.text, weight: 'bold', align: 'center' },
            { type: 'text', text: periodText, size: 'xs', color: COLORS.lightGray, align: 'center', margin: 'sm' },
            { type: 'separator', margin: 'md', color: COLORS.border },
            ...csoContents
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
        { type: 'text', text: '아주바이오 매출조회', size: 'xxs', color: COLORS.white, align: 'center' }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '6px'
    }
  };
}

/**
 * 병원 상세 캐러셀 생성 (3개월 - 기본)
 */
export function createHospitalCarousel(result: HospitalSalesResult): any {
  const { hospital, summary, monthlySales, topDrugs, periodMonths, periodText, blocks, csoSales } = result;
  const monthlyAvg = summary.total_sales / periodMonths;
  const trendText = formatMonthlyTrend(monthlySales.map(m => m.total_sales));

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

  // 메인 버블 (총매출 제거, 매출 흐름 추가)
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
                { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
              ]
            },
            {
              type: 'separator',
              margin: 'lg',
              color: COLORS.border
            },
            // 매출 흐름 (3개월: 전체 표시)
            {
              type: 'text',
              text: trendText,
              size: 'sm',
              color: COLORS.text,
              align: 'center',
              margin: 'lg',
              weight: 'bold'
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
                { type: 'text', text: '거래 품목 수', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: `${summary.drug_count}개`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'lg'
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

  // 캐러셀 버블 배열 구성
  const bubbles = [mainBubble, drugBubble];

  // 블록 현황 버블 추가
  if (blocks.length > 0) {
    bubbles.push(createBlockBubble(blocks, periodText));
  }

  // CSO별 매출 버블 추가 (CSO 2명 이상일 때만)
  if (csoSales.length >= 2) {
    bubbles.push(createCsoBubble(csoSales, periodMonths, periodText));
  }

  return {
    type: 'carousel',
    contents: bubbles
  };
}

/**
 * 병원 상세 캐러셀 생성 (6개월/1년용)
 * - 6개월: 품목별로 6개월 추이 + 평균
 * - 1년: 품목별로 시작/중간/종료 3포인트 + 평균
 */
export function createHospitalPeriodCarousel(result: HospitalSalesResult): any {
  const { hospital, summary, monthlySales, topDrugs, periodMonths, periodText, startIndex, blocks, csoSales } = result;
  const monthlyAvg = summary.total_sales / periodMonths;

  // 기간에 따른 매출 흐름 텍스트
  let trendDisplay: { trend: string; labels?: string };
  if (periodMonths <= 6) {
    // 6개월 이하: 전체 월별 표시
    trendDisplay = { trend: formatMonthlyTrend(monthlySales.map(m => m.total_sales)) };
  } else {
    // 1년: 3포인트 (시작/중간/종료) + 년월 레이블
    trendDisplay = formatYearlyTrend(monthlySales.map(m => m.total_sales), periodMonths, startIndex);
  }

  // 6개월용 품목별 컨텐츠
  const createDrug6MonthContents = (drugs: DrugSalesData[]) => {
    return drugs.map((drug) => ({
      type: 'box',
      layout: 'vertical',
      contents: [
        // 1행: 품목명 + 6개월 평균
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: formatDrugName(drug.drug_name), size: 'sm', color: COLORS.text, weight: 'bold', flex: 3, wrap: true },
            { type: 'text', text: formatMonthlyAvg(drug.monthlySales), size: 'sm', weight: 'bold', color: COLORS.text, align: 'end', flex: 1 }
          ]
        },
        // 2행: 6개월 추이
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
          // 1행: 품목명 + 1년 평균
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

  // 버튼 구성: 현재 기간에 따라 다른 버튼
  const footerButtons: any[] = [];
  if (periodMonths === 6) {
    // 6개월일 때: [3개월] [1년]
    footerButtons.push(
      {
        type: 'button',
        action: {
          type: 'postback',
          label: '3개월 보기',
          data: JSON.stringify({
            action: 'hospital_period',
            period_months: 3,
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
    );
  } else {
    // 1년일 때: [3개월] [6개월]
    footerButtons.push(
      {
        type: 'button',
        action: {
          type: 'postback',
          label: '3개월 보기',
          data: JSON.stringify({
            action: 'hospital_period',
            period_months: 3,
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
      }
    );
  }

  // 매출 흐름 표시 컨텐츠
  const trendContents: any[] = [
    {
      type: 'text',
      text: trendDisplay.trend,
      size: 'sm',
      color: COLORS.text,
      align: 'center',
      margin: 'lg',
      weight: 'bold'
    }
  ];

  // 1년인 경우 년월 레이블 추가
  if (trendDisplay.labels) {
    trendContents.push({
      type: 'text',
      text: trendDisplay.labels,
      size: 'xs',
      color: COLORS.subtext,
      align: 'center',
      margin: 'sm'
    });
  }

  // 메인 버블 (요약)
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
                { type: 'text', text: formatSalesMoney(monthlyAvg), size: 'lg', weight: 'bold', color: COLORS.text, align: 'end' }
              ]
            },
            {
              type: 'separator',
              margin: 'lg',
              color: COLORS.border
            },
            // 매출 흐름
            ...trendContents,
            {
              type: 'separator',
              margin: 'lg',
              color: COLORS.border
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '거래 품목 수', size: 'sm', color: COLORS.subtext },
                { type: 'text', text: `${summary.drug_count}개`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end' }
              ],
              margin: 'lg'
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
      contents: footerButtons,
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

  // 캐러셀 버블 배열 구성
  const bubbles = [mainBubble, drugBubble];

  // 블록 현황 버블 추가
  if (blocks.length > 0) {
    bubbles.push(createBlockBubble(blocks, periodText));
  }

  // CSO별 매출 버블 추가 (CSO 2명 이상일 때만)
  if (csoSales.length >= 2) {
    bubbles.push(createCsoBubble(csoSales, periodMonths, periodText));
  }

  return {
    type: 'carousel',
    contents: bubbles
  };
}
