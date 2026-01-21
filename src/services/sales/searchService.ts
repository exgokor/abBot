/**
 * 통합 검색 서비스
 * 지역/병원/약품 3개 카테고리 동시 검색
 */

import { getConnection } from "../database/connection";
import sql from "mssql";

// 색상 팔레트
const COLORS = {
  darkNavy: "#0D1B4C", // 상단/하단 진한 네이비
  background: "#F0F8FF", // 중간 배경색
  white: "#FFFFFF",
  navy: "#1D3A8F", // 버튼 primary
  lightBlue: "#DCEAF7", // 버튼 secondary
  text: "#000000",
  subtext: "#666666",
  lightGray: "#999999",
  border: "#E5E5E5",
};

// 로고 URL
const LOGO_URL =
  "https://storage.worksmobile.com/k1/drive/r/24101/300118260/300118260/@2001000000362831/3472530909344205321?fileId=QDIwMDEwMDAwMDAzNjI4MzF8MzQ3MjUzMDkwOTM0NDIwNTMyMXxGfDA&downloadType=O&resourceType=thumbnail&resourceFormat=origin&cache=1734582221372&conditionalAccessPolicy=false";

// 카테고리별 최대 결과 수
const MAX_RESULTS_PER_CATEGORY = 5;

export interface RegionSearchResult {
  hosIndex: string;
}

export interface HospitalSearchResult {
  hos_cd: string;
  hos_cso_cd: string;
  hos_name: string;
  hos_abbr: string | null;
}

export interface DrugSearchResult {
  drug_cd: string;
  drug_name: string;
}

export interface CsoSearchResult {
  cso_cd: string;
  cso_dealer_nm: string;
  cso_corp_nm: string | null;
}

export interface SearchResult {
  regions: RegionSearchResult[];
  hospitals: HospitalSearchResult[];
  drugs: DrugSearchResult[];
  csos: CsoSearchResult[];
  regionOverflow: boolean; // 6개 이상인지
  hospitalOverflow: boolean;
  drugOverflow: boolean;
  csoOverflow: boolean;
  // 전체 검색 수 (overflow 여부와 관계없이 실제 개수)
  regionTotalCount: number;
  hospitalTotalCount: number;
  drugTotalCount: number;
  csoTotalCount: number;
}

/**
 * 통합 검색 실행
 * 각 카테고리별로 최대 6개까지 조회 (5개 초과 여부 확인용)
 */
export async function searchAll(keyword: string): Promise<SearchResult> {
  if (keyword.length < 2) {
    return {
      regions: [],
      hospitals: [],
      drugs: [],
      csos: [],
      regionOverflow: false,
      hospitalOverflow: false,
      drugOverflow: false,
      csoOverflow: false,
      regionTotalCount: 0,
      hospitalTotalCount: 0,
      drugTotalCount: 0,
      csoTotalCount: 0,
    };
  }

  const pool = await getConnection();
  const searchLimit = MAX_RESULTS_PER_CATEGORY + 1; // 6개 조회해서 overflow 체크

  // 병렬 쿼리 실행
  const [
    regionResult,
    hospitalResult,
    drugResult,
    csoResult,
    regionCountResult,
    hospitalCountResult,
    drugCountResult,
    csoCountResult,
  ] = await Promise.all([
    // 지역 검색: hosIndex가 keyword로 시작하는 것들
    pool
      .request()
      .input("keyword", sql.NVarChar, `${keyword}%`)
      .input("limit", sql.Int, searchLimit).query(`
        SELECT DISTINCT TOP (@limit) hosIndex
        FROM V_REGION_MONTHLY_SALES_byClaude
        WHERE hosIndex LIKE @keyword
        ORDER BY hosIndex
      `),

    // 병원 검색: 병원명에 keyword 포함
    pool
      .request()
      .input("keyword", sql.NVarChar, `%${keyword}%`)
      .input("limit", sql.Int, searchLimit).query(`
        SELECT DISTINCT TOP (@limit) hos_cd, hos_cso_cd, hos_name, hos_abbr
        FROM HOSPITAL_TBL
        WHERE hos_name LIKE @keyword OR hos_abbr LIKE @keyword
        ORDER BY hos_name
      `),

    // 약품 검색: 약품명에 keyword 포함
    pool
      .request()
      .input("keyword", sql.NVarChar, `%${keyword}%`)
      .input("limit", sql.Int, searchLimit).query(`
        SELECT DISTINCT TOP (@limit) drug_cd, drug_name
        FROM DRUG_TBL
        WHERE drug_name LIKE @keyword AND drug_isvalid = 'Y'
        ORDER BY drug_name
      `),

    // CSO 검색: dealer_nm 정확 일치 OR corp_nm 포함
    pool
      .request()
      .input("keyword", sql.NVarChar, keyword)
      .input("keywordLike", sql.NVarChar, `%${keyword}%`)
      .input("limit", sql.Int, searchLimit).query(`
        SELECT DISTINCT TOP (@limit) cso_cd, cso_dealer_nm, cso_corp_nm
        FROM CSO_TBL
        WHERE cso_is_valid = 'Y'
          AND (cso_dealer_nm = @keyword OR cso_corp_nm LIKE @keywordLike)
        ORDER BY cso_dealer_nm
      `),

    // 전체 개수 쿼리들
    pool.request().input("keyword", sql.NVarChar, `${keyword}%`).query(`
        SELECT COUNT(DISTINCT hosIndex) AS cnt
        FROM V_REGION_MONTHLY_SALES_byClaude
        WHERE hosIndex LIKE @keyword
      `),

    pool.request().input("keyword", sql.NVarChar, `%${keyword}%`).query(`
        SELECT COUNT(*) AS cnt
        FROM (
          SELECT DISTINCT hos_cd, hos_cso_cd
          FROM HOSPITAL_TBL
          WHERE hos_name LIKE @keyword OR hos_abbr LIKE @keyword
        ) t
      `),

    pool.request().input("keyword", sql.NVarChar, `%${keyword}%`).query(`
        SELECT COUNT(DISTINCT drug_cd) AS cnt
        FROM DRUG_TBL
        WHERE drug_name LIKE @keyword AND drug_isvalid = 'Y'
      `),

    pool
      .request()
      .input("keyword", sql.NVarChar, keyword)
      .input("keywordLike", sql.NVarChar, `%${keyword}%`).query(`
        SELECT COUNT(DISTINCT cso_cd) AS cnt
        FROM CSO_TBL
        WHERE cso_is_valid = 'Y'
          AND (cso_dealer_nm = @keyword OR cso_corp_nm LIKE @keywordLike)
      `),
  ]);

  const regions = regionResult.recordset as RegionSearchResult[];
  const hospitals = hospitalResult.recordset as HospitalSearchResult[];
  const drugs = drugResult.recordset as DrugSearchResult[];
  const csos = csoResult.recordset as CsoSearchResult[];

  return {
    regions: regions.slice(0, MAX_RESULTS_PER_CATEGORY),
    hospitals: hospitals.slice(0, MAX_RESULTS_PER_CATEGORY),
    drugs: drugs.slice(0, MAX_RESULTS_PER_CATEGORY),
    csos: csos.slice(0, MAX_RESULTS_PER_CATEGORY),
    regionOverflow: regions.length > MAX_RESULTS_PER_CATEGORY,
    hospitalOverflow: hospitals.length > MAX_RESULTS_PER_CATEGORY,
    drugOverflow: drugs.length > MAX_RESULTS_PER_CATEGORY,
    csoOverflow: csos.length > MAX_RESULTS_PER_CATEGORY,
    regionTotalCount: regionCountResult.recordset[0]?.cnt || 0,
    hospitalTotalCount: hospitalCountResult.recordset[0]?.cnt || 0,
    drugTotalCount: drugCountResult.recordset[0]?.cnt || 0,
    csoTotalCount: csoCountResult.recordset[0]?.cnt || 0,
  };
}

/**
 * 검색 결과 총 개수
 */
export function getTotalCount(result: SearchResult): number {
  return (
    result.regions.length +
    result.hospitals.length +
    result.drugs.length +
    result.csos.length
  );
}

/**
 * 단일 결과인지 확인
 */
export function isSingleResult(result: SearchResult): boolean {
  return getTotalCount(result) === 1;
}

/**
 * 카테고리별 3개월 매출 트렌드 조회
 */
export interface CategoryTrendData {
  months: { year: number; month: number; sales: number }[];
  avgSales: number;
  topDrugs: { drug_name: string; avgSales: number }[];
}

export async function getCategoryTrend(
  category: "region" | "hospital" | "drug" | "cso",
  keyword: string,
  searchResult: SearchResult,
): Promise<CategoryTrendData | null> {
  const pool = await getConnection();

  // DB에서 최신 sales_index 조회
  const maxIndexResult = await pool.request().query(`
    SELECT MAX(sales_index) AS max_index FROM SALES_TBL
  `);
  const endIndex = maxIndexResult.recordset[0]?.max_index;
  if (!endIndex) return null;

  const startIndex = endIndex - 2; // 최신 데이터 기준 3개월

  try {
    let monthlyResult: any;
    let drugResult: any;

    if (category === "region" && searchResult.regionTotalCount > 0) {
      // 지역별 3개월 매출
      monthlyResult = await pool
        .request()
        .input("keyword", sql.NVarChar, `${keyword}%`)
        .input("startIndex", sql.Int, startIndex)
        .input("endIndex", sql.Int, endIndex).query(`
          SELECT sales_year, sales_month, SUM(total_sales) AS sales
          FROM V_REGION_MONTHLY_SALES_byClaude
          WHERE hosIndex LIKE @keyword
            AND sales_index BETWEEN @startIndex AND @endIndex
          GROUP BY sales_year, sales_month, sales_index
          ORDER BY sales_index
        `);

      // 지역별 품목 매출 (월별 합계의 평균)
      drugResult = await pool
        .request()
        .input("keyword", sql.NVarChar, `${keyword}%`)
        .input("startIndex", sql.Int, startIndex)
        .input("endIndex", sql.Int, endIndex).query(`
          SELECT TOP 5 drug_name, AVG(monthly_sales) AS avgSales
          FROM (
            SELECT d.drug_name, s.sales_index, SUM(s.total_sales) AS monthly_sales
            FROM V_HOSPITAL_DRUG_MONTHLY_byClaude s
            JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
              AND s.sales_index BETWEEN d.start_index AND d.end_index
            WHERE s.hosIndex LIKE @keyword
              AND s.sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY d.drug_name, s.sales_index
          ) sub
          GROUP BY drug_name
          ORDER BY avgSales DESC
        `);
    } else if (category === "hospital" && searchResult.hospitalTotalCount > 0) {
      // 병원별 3개월 매출 - 키워드로 검색된 전체 병원 대상
      monthlyResult = await pool
        .request()
        .input("keyword", sql.NVarChar, `%${keyword}%`)
        .input("startIndex", sql.Int, startIndex)
        .input("endIndex", sql.Int, endIndex).query(`
          SELECT sales_year, sales_month, SUM(s.total_sales) AS sales
          FROM V_HOSPITAL_MONTHLY_SALES_byClaude s
          JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd AND s.hos_cso_cd = h.hos_cso_cd
          WHERE (h.hos_name LIKE @keyword OR h.hos_abbr LIKE @keyword)
            AND s.sales_index BETWEEN @startIndex AND @endIndex
          GROUP BY sales_year, sales_month, s.sales_index
          ORDER BY s.sales_index
        `);

      // 병원별 품목 매출 (월별 합계의 평균)
      drugResult = await pool
        .request()
        .input("keyword", sql.NVarChar, `%${keyword}%`)
        .input("startIndex", sql.Int, startIndex)
        .input("endIndex", sql.Int, endIndex).query(`
          SELECT TOP 5 drug_name, AVG(monthly_sales) AS avgSales
          FROM (
            SELECT d.drug_name, s.sales_index, SUM(s.total_sales) AS monthly_sales
            FROM V_HOSPITAL_DRUG_MONTHLY_byClaude s
            JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
              AND s.sales_index BETWEEN d.start_index AND d.end_index
            JOIN HOSPITAL_TBL h ON s.hos_cd = h.hos_cd AND s.hos_cso_cd = h.hos_cso_cd
            WHERE (h.hos_name LIKE @keyword OR h.hos_abbr LIKE @keyword)
              AND s.sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY d.drug_name, s.sales_index
          ) sub
          GROUP BY drug_name
          ORDER BY avgSales DESC
        `);
    } else if (category === "drug" && searchResult.drugTotalCount > 0) {
      // 품목별 3개월 매출 - 키워드로 검색된 전체 약품 대상
      monthlyResult = await pool
        .request()
        .input("keyword", sql.NVarChar, `%${keyword}%`)
        .input("startIndex", sql.Int, startIndex)
        .input("endIndex", sql.Int, endIndex).query(`
          SELECT sales_year, sales_month, SUM(s.total_sales) AS sales
          FROM V_DRUG_MONTHLY_SALES_byClaude s
          JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
          WHERE d.drug_name LIKE @keyword AND d.drug_isvalid = 'Y'
            AND s.sales_index BETWEEN @startIndex AND @endIndex
          GROUP BY sales_year, sales_month, s.sales_index
          ORDER BY s.sales_index
        `);

      // 약품별 품목 매출 (월별 합계의 평균)
      drugResult = await pool
        .request()
        .input("keyword", sql.NVarChar, `%${keyword}%`)
        .input("startIndex", sql.Int, startIndex)
        .input("endIndex", sql.Int, endIndex).query(`
          SELECT TOP 5 drug_name, AVG(monthly_sales) AS avgSales
          FROM (
            SELECT s.drug_name, s.sales_index, SUM(s.total_sales) AS monthly_sales
            FROM V_DRUG_MONTHLY_SALES_byClaude s
            JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
              AND s.sales_index BETWEEN d.start_index AND d.end_index
            WHERE d.drug_name LIKE @keyword AND d.drug_isvalid = 'Y'
              AND s.sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY s.drug_name, s.sales_index
          ) sub
          GROUP BY drug_name
          ORDER BY avgSales DESC
        `);
    } else if (category === "cso" && searchResult.csoTotalCount > 0) {
      // CSO별 3개월 매출 - 키워드로 검색된 전체 CSO 대상
      monthlyResult = await pool
        .request()
        .input("keyword", sql.NVarChar, keyword)
        .input("keywordLike", sql.NVarChar, `%${keyword}%`)
        .input("startIndex", sql.Int, startIndex)
        .input("endIndex", sql.Int, endIndex).query(`
          SELECT sales_year, sales_month, SUM(s.total_sales) AS sales
          FROM V_CSO_MONTHLY_SALES_byClaude s
          JOIN CSO_TBL c ON s.cso_cd = c.cso_cd
          WHERE c.cso_is_valid = 'Y'
            AND (c.cso_dealer_nm = @keyword OR c.cso_corp_nm LIKE @keywordLike)
            AND s.sales_index BETWEEN @startIndex AND @endIndex
          GROUP BY sales_year, sales_month, s.sales_index
          ORDER BY s.sales_index
        `);

      // CSO별 품목 매출 (월별 합계의 평균)
      drugResult = await pool
        .request()
        .input("keyword", sql.NVarChar, keyword)
        .input("keywordLike", sql.NVarChar, `%${keyword}%`)
        .input("startIndex", sql.Int, startIndex)
        .input("endIndex", sql.Int, endIndex).query(`
          SELECT TOP 5 drug_name, AVG(monthly_sales) AS avgSales
          FROM (
            SELECT d.drug_name, s.sales_index, SUM(s.total_sales) AS monthly_sales
            FROM V_CSO_DRUG_MONTHLY_byClaude s
            JOIN CSO_TBL c ON s.cso_cd = c.cso_cd
            JOIN DRUG_TBL d ON s.drug_cd = d.drug_cd
              AND s.sales_index BETWEEN d.start_index AND d.end_index
            WHERE c.cso_is_valid = 'Y'
              AND (c.cso_dealer_nm = @keyword OR c.cso_corp_nm LIKE @keywordLike)
              AND s.sales_index BETWEEN @startIndex AND @endIndex
            GROUP BY d.drug_name, s.sales_index
          ) sub
          GROUP BY drug_name
          ORDER BY avgSales DESC
        `);
    } else {
      return null;
    }

    if (!monthlyResult || monthlyResult.recordset.length === 0) {
      return null;
    }

    const months = monthlyResult.recordset.map((r: any) => ({
      year: r.sales_year,
      month: r.sales_month,
      sales: r.sales || 0,
    }));

    const totalSales = months.reduce((sum: number, m: any) => sum + m.sales, 0);
    const avgSales = months.length > 0 ? totalSales / months.length : 0;

    const topDrugs =
      drugResult?.recordset?.map((r: any) => ({
        drug_name: r.drug_name,
        avgSales: r.avgSales || 0,
      })) || [];

    return { months, avgSales, topDrugs };
  } catch (error) {
    console.error("getCategoryTrend error:", error);
    return null;
  }
}

/**
 * 금액 포맷 (백만 단위)
 */
function formatMoney(amount: number): string {
  const millions = amount / 1000000;
  if (millions >= 1) {
    return `${millions.toFixed(1)}백만`;
  }
  return `${millions.toFixed(1)}백만`;
}

/**
 * 검색 결과 캐러셀 생성
 * 버튼이 있는 버블을 먼저 배치
 */
export function createSearchResultCarousel(
  keyword: string,
  result: SearchResult,
  trendData?: {
    region?: CategoryTrendData | null;
    hospital?: CategoryTrendData | null;
    drug?: CategoryTrendData | null;
    cso?: CategoryTrendData | null;
  },
): any {
  const bubbles: any[] = [];

  // 버튼이 있는 버블들 먼저 (지역 → 병원 → 약품 → CSO 순)
  if (result.regions.length > 0 && !result.regionOverflow) {
    bubbles.push(createRegionBubble(result.regions));
  }

  if (result.hospitals.length > 0 && !result.hospitalOverflow) {
    bubbles.push(createHospitalBubble(result.hospitals));
  }

  if (result.drugs.length > 0 && !result.drugOverflow) {
    bubbles.push(createDrugBubble(result.drugs));
  }

  if (result.csos.length > 0 && !result.csoOverflow) {
    bubbles.push(createCsoBubble(result.csos));
  }

  // 검색 결과가 있는 카테고리에 대해 매출 버블 추가
  if (trendData) {
    if (result.regionTotalCount > 0 && trendData.region) {
      bubbles.push(createSalesSummaryBubble("지역", result.regionTotalCount, trendData.region));
    }
    if (result.hospitalTotalCount > 0 && trendData.hospital) {
      bubbles.push(createSalesSummaryBubble("병원", result.hospitalTotalCount, trendData.hospital));
    }
    if (result.drugTotalCount > 0 && trendData.drug) {
      bubbles.push(createSalesSummaryBubble("약품", result.drugTotalCount, trendData.drug));
    }
    if (result.csoTotalCount > 0 && trendData.cso) {
      bubbles.push(createSalesSummaryBubble("CSO", result.csoTotalCount, trendData.cso));
    }
  }

  // 요약 버블은 맨 뒤로
  const summaryBubble = createSummaryBubble(keyword, result);
  bubbles.push(summaryBubble);

  return {
    type: "carousel",
    contents: bubbles,
  };
}

/**
 * 공통 버블 구조 생성 (새 디자인: 헤더 축소, 푸터 추가, 로고, 둥근 상자)
 */
function createBaseBubble(bodyContents: any[]): any {
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "AJUBIO",
          size: "sm",
          weight: "bold",
          color: COLORS.white,
          align: "center",
        },
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: "8px",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        // 로고 이미지
        {
          type: "image",
          url: LOGO_URL,
          size: "sm",
          aspectRatio: "5:3",
          aspectMode: "fit",
        },
        // 둥근 모서리 흰색 상자
        {
          type: "box",
          layout: "vertical",
          contents: bodyContents,
          backgroundColor: COLORS.white,
          cornerRadius: "12px",
          paddingAll: "16px",
          margin: "md",
        },
      ],
      backgroundColor: COLORS.background,
      paddingAll: "12px",
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: " ",
          size: "xxs",
          color: COLORS.white,
          align: "center",
        },
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: "6px",
    },
  };
}

/**
 * 요약 버블 생성 (검색 결과 수 + 상세 입력 안내)
 */
function createSummaryBubble(keyword: string, result: SearchResult): any {
  const statusContents: any[] = [];

  // 제목
  statusContents.push({
    type: "text",
    text: `"${keyword}" 검색 결과`,
    size: "md",
    color: COLORS.text,
    weight: "bold",
    align: "center",
  });

  statusContents.push({
    type: "separator",
    margin: "md",
    color: COLORS.border,
  });

  // 카테고리별 검색 결과 수
  const categoryResults: any[] = [];

  // 지역 상태
  if (result.regionTotalCount > 0) {
    categoryResults.push(
      createStatusRow(
        "지역",
        `${result.regionTotalCount}건`,
        result.regionOverflow ? COLORS.lightGray : COLORS.navy,
      ),
    );
  }

  // 병원 상태
  if (result.hospitalTotalCount > 0) {
    categoryResults.push(
      createStatusRow(
        "병원",
        `${result.hospitalTotalCount}건`,
        result.hospitalOverflow ? COLORS.lightGray : COLORS.navy,
      ),
    );
  }

  // 약품 상태
  if (result.drugTotalCount > 0) {
    categoryResults.push(
      createStatusRow(
        "약품",
        `${result.drugTotalCount}건`,
        result.drugOverflow ? COLORS.lightGray : COLORS.navy,
      ),
    );
  }

  // CSO 상태
  if (result.csoTotalCount > 0) {
    categoryResults.push(
      createStatusRow(
        "CSO",
        `${result.csoTotalCount}건`,
        result.csoOverflow ? COLORS.lightGray : COLORS.navy,
      ),
    );
  }

  if (categoryResults.length > 0) {
    statusContents.push({
      type: "box",
      layout: "vertical",
      contents: categoryResults,
      margin: "md",
    });
  }

  // overflow가 있으면 상세 입력 안내만 표시
  const hasOverflow =
    result.regionOverflow ||
    result.hospitalOverflow ||
    result.drugOverflow ||
    result.csoOverflow;

  if (hasOverflow) {
    statusContents.push({
      type: "separator",
      margin: "md",
      color: COLORS.border,
    });

    statusContents.push({
      type: "text",
      text: "검색어를 더 상세하게 입력해주세요.",
      size: "xs",
      color: COLORS.lightGray,
      align: "center",
      margin: "md",
    });
  }

  return createBaseBubble(statusContents);
}

/**
 * 카테고리별 매출 요약 버블 생성 (전체매출합 + 주요품목별 월평균)
 */
function createSalesSummaryBubble(
  categoryName: string,
  totalCount: number,
  trend: CategoryTrendData
): any {
  const trendText = trend.months.map((m) => formatMoney(m.sales)).join(" → ");

  // 품목별 매출 행 생성 (JSON 디자인 참고)
  const drugRows: any[] = trend.topDrugs.slice(0, 5).map((drug) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "box",
                layout: "vertical",
                contents: [],
                width: "2px",
                backgroundColor: COLORS.navy,
                height: "20px",
                position: "absolute",
              },
              {
                type: "text",
                size: "xs",
                flex: 0,
                margin: "xs",
                offsetStart: "10px",
                text: drug.drug_name.length > 12 ? drug.drug_name.slice(0, 12) + ".." : drug.drug_name,
                color: COLORS.subtext,
              },
            ],
          },
        ],
        margin: "xs",
        flex: 3,
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: formatMoney(drug.avgSales),
            size: "xs",
            align: "end",
            color: COLORS.subtext,
          },
        ],
        width: "80px",
      },
    ],
    margin: "sm",
  }));

  const bodyContents: any[] = [
    // 카테고리 타이틀
    {
      type: "text",
      text: `${categoryName} 매출`,
      weight: "bold",
      color: COLORS.navy,
      size: "sm",
    },
    // 전체 검색 수
    {
      type: "text",
      text: `${totalCount}건 검색됨`,
      size: "xxs",
      color: COLORS.lightGray,
      margin: "xs",
    },
    {
      type: "separator",
      margin: "lg",
    },
    // 월평균 매출
    {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: "월평균 매출",
          size: "sm",
          weight: "bold",
          color: COLORS.text,
        },
        {
          type: "text",
          text: formatMoney(trend.avgSales),
          weight: "bold",
          size: "sm",
          align: "end",
          color: COLORS.text,
        },
      ],
      margin: "lg",
    },
    // 월별 추이
    {
      type: "text",
      text: `(${trendText})`,
      size: "xxs",
      color: COLORS.lightGray,
      align: "end",
      margin: "xs",
    },
  ];

  // 주요 품목이 있으면 추가
  if (drugRows.length > 0) {
    bodyContents.push({
      type: "separator",
      margin: "lg",
    });
    bodyContents.push({
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: "주요 품목",
          size: "xs",
          weight: "bold",
          color: COLORS.text,
        },
        {
          type: "text",
          text: "월평균",
          size: "xs",
          align: "end",
          color: COLORS.text,
        },
      ],
      margin: "lg",
    });
    bodyContents.push({
      type: "separator",
      margin: "sm",
    });
    bodyContents.push(...drugRows);
  }

  return createBaseBubble(bodyContents);
}

/**
 * 트렌드 섹션 생성 (더 이상 사용하지 않음, 하위 호환용)
 */
function createTrendSection(
  categoryName: string,
  trend: CategoryTrendData,
): any {
  const trendText = trend.months.map((m) => formatMoney(m.sales)).join(" → ");

  const contents: any[] = [
    {
      type: "text",
      text: `${categoryName} 월평균: ${formatMoney(trend.avgSales)}`,
      size: "xs",
      color: COLORS.subtext,
      margin: "sm",
    },
    {
      type: "text",
      text: `(${trendText})`,
      size: "xxs",
      color: COLORS.lightGray,
    },
  ];

  // TOP 품목 표시 (최대 3개)
  if (trend.topDrugs.length > 0) {
    const topDrugsText = trend.topDrugs
      .slice(0, 3)
      .map((d) => `${d.drug_name.slice(0, 8)}: ${formatMoney(d.avgSales)}`)
      .join(", ");

    contents.push({
      type: "text",
      text: `주요품목: ${topDrugsText}`,
      size: "xxs",
      color: COLORS.lightGray,
      wrap: true,
      margin: "xs",
    });
  }

  return {
    type: "box",
    layout: "vertical",
    contents,
    margin: "sm",
  };
}

/**
 * 상태 행 생성
 */
function createStatusRow(
  label: string,
  value: string,
  valueColor: string,
): any {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: COLORS.subtext, flex: 1 },
      {
        type: "text",
        text: value,
        size: "sm",
        weight: "bold",
        color: valueColor,
        align: "end",
        flex: 2,
      },
    ],
    margin: "md",
  };
}

/**
 * 버튼 스타일 생성 (네이비/흰색, 연파랑/검은색 교차)
 */
function createStyledButtons(items: Array<{ label: string; data: string }>) {
  return items.map((item, index) => ({
    type: "button",
    action: {
      type: "postback",
      label: item.label,
      data: item.data,
    },
    style: index % 2 === 0 ? "primary" : "secondary",
    height: "sm",
    color: index % 2 === 0 ? COLORS.navy : COLORS.lightBlue,
    margin: "lg",
  }));
}

/**
 * 카테고리 버블 생성 (공통 함수)
 */
function createCategoryBubble(
  title: string,
  count: number,
  buttons: Array<{ label: string; data: string }>,
): any {
  const bodyContents = [
    {
      type: "text",
      text: title,
      size: "md",
      color: COLORS.text,
      weight: "bold",
      align: "center",
    },
    {
      type: "text",
      text: `${count}개 검색됨`,
      size: "xs",
      color: COLORS.lightGray,
      align: "center",
      margin: "xs",
    },
    {
      type: "separator",
      margin: "md",
      color: COLORS.border,
    },
    {
      type: "box",
      layout: "vertical",
      contents: createStyledButtons(buttons),
      spacing: "lg",
      margin: "md",
    },
  ];

  return createBaseBubble(bodyContents);
}

/**
 * 지역 버블 생성
 */
function createRegionBubble(regions: RegionSearchResult[]): any {
  const buttonData = regions.map((region) => ({
    label: region.hosIndex,
    data: JSON.stringify({
      action: "search_select",
      type: "region",
      value: region.hosIndex,
    }),
  }));

  return createCategoryBubble("지역 선택", regions.length, buttonData);
}

/**
 * 병원 버블 생성
 */
function createHospitalBubble(hospitals: HospitalSearchResult[]): any {
  const buttonData = hospitals.map((hospital) => ({
    label: hospital.hos_abbr || hospital.hos_name.slice(0, 20),
    data: JSON.stringify({
      action: "search_select",
      type: "hospital",
      value: `${hospital.hos_cd}|${hospital.hos_cso_cd}`,
    }),
  }));

  return createCategoryBubble("병원 선택", hospitals.length, buttonData);
}

/**
 * 약품 버블 생성
 */
function createDrugBubble(drugs: DrugSearchResult[]): any {
  const buttonData = drugs.map((drug) => ({
    label: drug.drug_name.slice(0, 20),
    data: JSON.stringify({
      action: "search_select",
      type: "drug",
      value: drug.drug_cd,
    }),
  }));

  return createCategoryBubble("약품 선택", drugs.length, buttonData);
}

/**
 * CSO 버블 생성
 */
function createCsoBubble(csos: CsoSearchResult[]): any {
  const buttonData = csos.map((cso) => ({
    label:
      cso.cso_dealer_nm +
      (cso.cso_corp_nm ? ` (${cso.cso_corp_nm.slice(0, 6)})` : ""),
    data: JSON.stringify({
      action: "search_select",
      type: "cso",
      value: cso.cso_cd,
    }),
  }));

  return createCategoryBubble("CSO 선택", csos.length, buttonData);
}
