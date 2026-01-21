/**
 * 통합 검색 서비스
 * 지역/병원/약품 3개 카테고리 동시 검색
 */

import { getConnection } from '../database/connection';
import sql from 'mssql';

// 색상 팔레트
const COLORS = {
  darkNavy: '#0D1B4C',      // 상단/하단 진한 네이비
  background: '#F0F8FF',     // 중간 배경색
  white: '#FFFFFF',
  navy: '#1D3A8F',           // 버튼 primary
  lightBlue: '#DCEAF7',      // 버튼 secondary
  text: '#000000',
  subtext: '#666666',
  lightGray: '#999999',
  border: '#E5E5E5'
};

// 로고 URL
const LOGO_URL = 'https://storage.worksmobile.com/k1/drive/r/24101/300118260/300118260/@2001000000362831/3472530909344205321?fileId=QDIwMDEwMDAwMDAzNjI4MzF8MzQ3MjUzMDkwOTM0NDIwNTMyMXxGfDA&downloadType=O&resourceType=thumbnail&resourceFormat=origin&cache=1734582221372&conditionalAccessPolicy=false';

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

export interface SearchResult {
  regions: RegionSearchResult[];
  hospitals: HospitalSearchResult[];
  drugs: DrugSearchResult[];
  regionOverflow: boolean;   // 6개 이상인지
  hospitalOverflow: boolean;
  drugOverflow: boolean;
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
      regionOverflow: false,
      hospitalOverflow: false,
      drugOverflow: false
    };
  }

  const pool = await getConnection();
  const searchLimit = MAX_RESULTS_PER_CATEGORY + 1; // 6개 조회해서 overflow 체크

  // 병렬 쿼리 실행
  const [regionResult, hospitalResult, drugResult] = await Promise.all([
    // 지역 검색: hosIndex가 keyword로 시작하는 것들
    pool.request()
      .input('keyword', sql.NVarChar, `${keyword}%`)
      .input('limit', sql.Int, searchLimit)
      .query(`
        SELECT DISTINCT TOP (@limit) hosIndex
        FROM V_REGION_MONTHLY_SALES_byClaude
        WHERE hosIndex LIKE @keyword
        ORDER BY hosIndex
      `),

    // 병원 검색: 병원명에 keyword 포함
    pool.request()
      .input('keyword', sql.NVarChar, `%${keyword}%`)
      .input('limit', sql.Int, searchLimit)
      .query(`
        SELECT DISTINCT TOP (@limit) hos_cd, hos_cso_cd, hos_name, hos_abbr
        FROM HOSPITAL_TBL
        WHERE hos_name LIKE @keyword OR hos_abbr LIKE @keyword
        ORDER BY hos_name
      `),

    // 약품 검색: 약품명에 keyword 포함
    pool.request()
      .input('keyword', sql.NVarChar, `%${keyword}%`)
      .input('limit', sql.Int, searchLimit)
      .query(`
        SELECT DISTINCT TOP (@limit) drug_cd, drug_name
        FROM DRUG_TBL
        WHERE drug_name LIKE @keyword AND drug_isvalid = 'Y'
        ORDER BY drug_name
      `)
  ]);

  const regions = regionResult.recordset as RegionSearchResult[];
  const hospitals = hospitalResult.recordset as HospitalSearchResult[];
  const drugs = drugResult.recordset as DrugSearchResult[];

  return {
    regions: regions.slice(0, MAX_RESULTS_PER_CATEGORY),
    hospitals: hospitals.slice(0, MAX_RESULTS_PER_CATEGORY),
    drugs: drugs.slice(0, MAX_RESULTS_PER_CATEGORY),
    regionOverflow: regions.length > MAX_RESULTS_PER_CATEGORY,
    hospitalOverflow: hospitals.length > MAX_RESULTS_PER_CATEGORY,
    drugOverflow: drugs.length > MAX_RESULTS_PER_CATEGORY
  };
}

/**
 * 검색 결과 총 개수
 */
export function getTotalCount(result: SearchResult): number {
  return result.regions.length + result.hospitals.length + result.drugs.length;
}

/**
 * 단일 결과인지 확인
 */
export function isSingleResult(result: SearchResult): boolean {
  return getTotalCount(result) === 1;
}

/**
 * 검색 결과 캐러셀 생성
 * 버튼이 있는 버블을 먼저 배치
 */
export function createSearchResultCarousel(keyword: string, result: SearchResult): any {
  const bubbles: any[] = [];

  // 버튼이 있는 버블들 먼저 (지역 → 병원 → 약품 순)
  if (result.regions.length > 0 && !result.regionOverflow) {
    bubbles.push(createRegionBubble(result.regions));
  }

  if (result.hospitals.length > 0 && !result.hospitalOverflow) {
    bubbles.push(createHospitalBubble(result.hospitals));
  }

  if (result.drugs.length > 0 && !result.drugOverflow) {
    bubbles.push(createDrugBubble(result.drugs));
  }

  // 요약 버블은 맨 뒤로
  const summaryBubble = createSummaryBubble(keyword, result);
  bubbles.push(summaryBubble);

  return {
    type: 'carousel',
    contents: bubbles
  };
}

/**
 * 요약 버블 생성 (header 사용)
 */
function createSummaryBubble(keyword: string, result: SearchResult): any {
  const statusContents: any[] = [];

  // 지역 상태
  if (result.regionOverflow) {
    statusContents.push(createStatusRow('지역', '결과가 많습니다', COLORS.lightGray));
  } else if (result.regions.length > 0) {
    statusContents.push(createStatusRow('지역', `${result.regions.length}건`, COLORS.navy));
  } else {
    statusContents.push(createStatusRow('지역', '없음', COLORS.lightGray));
  }

  // 병원 상태
  if (result.hospitalOverflow) {
    statusContents.push(createStatusRow('병원', '결과가 많습니다', COLORS.lightGray));
  } else if (result.hospitals.length > 0) {
    statusContents.push(createStatusRow('병원', `${result.hospitals.length}건`, COLORS.navy));
  } else {
    statusContents.push(createStatusRow('병원', '없음', COLORS.lightGray));
  }

  // 약품 상태
  if (result.drugOverflow) {
    statusContents.push(createStatusRow('약품', '결과가 많습니다', COLORS.lightGray));
  } else if (result.drugs.length > 0) {
    statusContents.push(createStatusRow('약품', `${result.drugs.length}건`, COLORS.navy));
  } else {
    statusContents.push(createStatusRow('약품', '없음', COLORS.lightGray));
  }

  // overflow가 있으면 안내 문구 추가
  const hasOverflow = result.regionOverflow || result.hospitalOverflow || result.drugOverflow;

  if (hasOverflow) {
    statusContents.push({
      type: 'separator',
      margin: 'lg',
      color: COLORS.border
    });
    statusContents.push({
      type: 'text',
      text: '검색어를 더 상세하게 입력해주세요.',
      size: 'xs',
      color: COLORS.lightGray,
      align: 'center',
      margin: 'lg'
    });
  }

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          size: 'lg',
          weight: 'bold',
          color: COLORS.white,
          align: 'center'
        }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '15px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `"${keyword}" 검색 결과`,
          size: 'lg',
          color: COLORS.text,
          weight: 'bold',
          align: 'center'
        },
        {
          type: 'separator',
          margin: 'lg',
          color: COLORS.border
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: statusContents,
          margin: 'lg'
        }
      ],
      backgroundColor: COLORS.white,
      paddingAll: '20px'
    }
  };
}

/**
 * 상태 행 생성
 */
function createStatusRow(label: string, value: string, valueColor: string): any {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: COLORS.subtext, flex: 1 },
      { type: 'text', text: value, size: 'sm', weight: 'bold', color: valueColor, align: 'end', flex: 2 }
    ],
    margin: 'md'
  };
}

/**
 * 버튼 스타일 생성 (네이비/흰색, 연파랑/검은색 교차)
 */
function createStyledButtons(items: Array<{ label: string; data: string }>) {
  return items.map((item, index) => ({
    type: 'button',
    action: {
      type: 'postback',
      label: item.label,
      data: item.data
    },
    style: index % 2 === 0 ? 'primary' : 'secondary',
    height: 'sm',
    color: index % 2 === 0 ? COLORS.navy : COLORS.lightBlue
  }));
}

/**
 * 지역 버블 생성 (header 사용)
 */
function createRegionBubble(regions: RegionSearchResult[]): any {
  const buttonData = regions.map(region => ({
    label: region.hosIndex,
    data: JSON.stringify({
      action: 'search_select',
      type: 'region',
      value: region.hosIndex
    })
  }));

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          size: 'lg',
          weight: 'bold',
          color: COLORS.white,
          align: 'center'
        }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '15px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '지역 선택',
          size: 'lg',
          color: COLORS.text,
          weight: 'bold',
          align: 'center'
        },
        {
          type: 'text',
          text: `${regions.length}개 지역이 검색되었습니다`,
          size: 'xs',
          color: COLORS.lightGray,
          align: 'center',
          margin: 'sm'
        },
        {
          type: 'separator',
          margin: 'lg',
          color: COLORS.border
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: createStyledButtons(buttonData),
          spacing: 'md',
          margin: 'lg'
        }
      ],
      backgroundColor: COLORS.white,
      paddingAll: '20px'
    }
  };
}

/**
 * 병원 버블 생성 (header 사용)
 */
function createHospitalBubble(hospitals: HospitalSearchResult[]): any {
  const buttonData = hospitals.map(hospital => ({
    label: hospital.hos_abbr || hospital.hos_name.slice(0, 20),
    data: JSON.stringify({
      action: 'search_select',
      type: 'hospital',
      value: `${hospital.hos_cd}|${hospital.hos_cso_cd}`
    })
  }));

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          size: 'lg',
          weight: 'bold',
          color: COLORS.white,
          align: 'center'
        }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '15px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '병원 선택',
          size: 'lg',
          color: COLORS.text,
          weight: 'bold',
          align: 'center'
        },
        {
          type: 'text',
          text: `${hospitals.length}개 병원이 검색되었습니다`,
          size: 'xs',
          color: COLORS.lightGray,
          align: 'center',
          margin: 'sm'
        },
        {
          type: 'separator',
          margin: 'lg',
          color: COLORS.border
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: createStyledButtons(buttonData),
          spacing: 'md',
          margin: 'lg'
        }
      ],
      backgroundColor: COLORS.white,
      paddingAll: '20px'
    }
  };
}

/**
 * 약품 버블 생성 (header 사용)
 */
function createDrugBubble(drugs: DrugSearchResult[]): any {
  const buttonData = drugs.map(drug => ({
    label: drug.drug_name.slice(0, 20),
    data: JSON.stringify({
      action: 'search_select',
      type: 'drug',
      value: drug.drug_cd
    })
  }));

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'AJUBIO',
          size: 'lg',
          weight: 'bold',
          color: COLORS.white,
          align: 'center'
        }
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '15px'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '약품 선택',
          size: 'lg',
          color: COLORS.text,
          weight: 'bold',
          align: 'center'
        },
        {
          type: 'text',
          text: `${drugs.length}개 약품이 검색되었습니다`,
          size: 'xs',
          color: COLORS.lightGray,
          align: 'center',
          margin: 'sm'
        },
        {
          type: 'separator',
          margin: 'lg',
          color: COLORS.border
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: createStyledButtons(buttonData),
          spacing: 'md',
          margin: 'lg'
        }
      ],
      backgroundColor: COLORS.white,
      paddingAll: '20px'
    }
  };
}
