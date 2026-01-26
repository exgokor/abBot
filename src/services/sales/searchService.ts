/**
 * 통합 검색 서비스 (V2)
 * V_SEARCH_INDEX_byClaude 뷰 사용
 * CSO, HOSPITAL, DRUG 3개 카테고리
 */

import { getConnection } from '../database/connection';
import sql from 'mssql';
import {
  encodePostback,
  createCsoPostback,
  createHospitalPostback,
  createDrugPostback,
} from '../../types/postback';

// 색상 팔레트
const COLORS = {
  darkNavy: '#0D1B4C',
  background: '#F0F8FF',
  white: '#FFFFFF',
  navy: '#1D3A8F',
  lightBlue: '#DCEAF7',
  text: '#000000',
  subtext: '#666666',
  lightGray: '#999999',
  border: '#E5E5E5',
};

// 로고 URL
const LOGO_URL =
  'https://storage.worksmobile.com/k1/drive/r/24101/300118260/300118260/@2001000000362831/3472530909344205321?fileId=QDIwMDEwMDAwMDAzNjI4MzF8MzQ3MjUzMDkwOTM0NDIwNTMyMXxGfDA&downloadType=O&resourceType=thumbnail&resourceFormat=origin&cache=1734582221372&conditionalAccessPolicy=false';

// 버블당 최대 버튼 수
const MAX_BUTTONS_PER_BUBBLE = 5;
// 전체 최대 결과 수
const MAX_TOTAL_RESULTS = 20;

// 검색 결과 인터페이스
export interface SearchIndexResult {
  entity_type: 'CSO' | 'HOSPITAL' | 'DRUG';
  entity_cd: string;
  search_name: string;
  search_abbr: string | null;
  region: string | null;
}

export interface SearchResult {
  csos: SearchIndexResult[];
  hospitals: SearchIndexResult[];
  drugs: SearchIndexResult[];
  totalCount: number;
  csoCount: number;
  hospitalCount: number;
  drugCount: number;
}

/**
 * V_SEARCH_INDEX_byClaude 뷰로 통합 검색
 */
export async function searchAll(keyword: string): Promise<SearchResult> {
  if (keyword.length < 2) {
    return {
      csos: [],
      hospitals: [],
      drugs: [],
      totalCount: 0,
      csoCount: 0,
      hospitalCount: 0,
      drugCount: 0,
    };
  }

  const pool = await getConnection();

  // V_SEARCH_INDEX_byClaude에서 검색
  const result = await pool
    .request()
    .input('keyword', sql.NVarChar, `%${keyword}%`).query(`
      SELECT entity_type, entity_cd, search_name, search_abbr, region
      FROM V_SEARCH_INDEX_byClaude
      WHERE search_name LIKE @keyword
         OR region LIKE @keyword
         OR search_abbr LIKE @keyword
      ORDER BY entity_type, search_name
    `);

  const allResults = result.recordset as SearchIndexResult[];

  // 카테고리별 분류
  const csos = allResults.filter((r) => r.entity_type === 'CSO');
  const hospitals = allResults.filter((r) => r.entity_type === 'HOSPITAL');
  const drugs = allResults.filter((r) => r.entity_type === 'DRUG');

  return {
    csos,
    hospitals,
    drugs,
    totalCount: allResults.length,
    csoCount: csos.length,
    hospitalCount: hospitals.length,
    drugCount: drugs.length,
  };
}

/**
 * 검색 결과 총 개수
 */
export function getTotalCount(result: SearchResult): number {
  return result.totalCount;
}

/**
 * 단일 결과인지 확인
 */
export function isSingleResult(result: SearchResult): boolean {
  return result.totalCount === 1;
}

/**
 * 결과가 너무 많은지 확인 (20개 초과)
 */
export function isTooManyResults(result: SearchResult): boolean {
  return result.totalCount > MAX_TOTAL_RESULTS;
}

/**
 * 단일 결과의 entity 정보 반환
 */
export function getSingleEntity(result: SearchResult): SearchIndexResult | null {
  if (!isSingleResult(result)) return null;

  if (result.csos.length === 1) return result.csos[0];
  if (result.hospitals.length === 1) return result.hospitals[0];
  if (result.drugs.length === 1) return result.drugs[0];
  return null;
}

/**
 * 검색 결과 캐러셀 생성 (새 요구사항)
 * - 카테고리별 버블
 * - 버블당 버튼 5개
 */
export function createSearchResultCarousel(
  keyword: string,
  result: SearchResult,
  periodText: string
): any {
  const bubbles: any[] = [];

  // CSO 버블들 (버블당 5개 버튼)
  if (result.csos.length > 0) {
    const csoBubbles = createCategoryBubbles('CSO', result.csos, periodText);
    bubbles.push(...csoBubbles);
  }

  // HOSPITAL 버블들
  if (result.hospitals.length > 0) {
    const hospitalBubbles = createCategoryBubbles('HOSPITAL', result.hospitals, periodText);
    bubbles.push(...hospitalBubbles);
  }

  // DRUG 버블들
  if (result.drugs.length > 0) {
    const drugBubbles = createCategoryBubbles('DRUG', result.drugs, periodText);
    bubbles.push(...drugBubbles);
  }

  // 요약 버블 추가
  bubbles.push(createSummaryBubble(keyword, result));

  return {
    type: 'carousel',
    contents: bubbles,
  };
}

/**
 * 카테고리별 버블 배열 생성 (버블당 5개 버튼)
 */
function createCategoryBubbles(
  category: 'CSO' | 'HOSPITAL' | 'DRUG',
  items: SearchIndexResult[],
  periodText: string
): any[] {
  const bubbles: any[] = [];
  const categoryName = getCategoryName(category);

  // 버튼 5개씩 버블로 분리
  for (let i = 0; i < items.length; i += MAX_BUTTONS_PER_BUBBLE) {
    const chunk = items.slice(i, i + MAX_BUTTONS_PER_BUBBLE);
    const bubbleIndex = Math.floor(i / MAX_BUTTONS_PER_BUBBLE) + 1;
    const totalBubbles = Math.ceil(items.length / MAX_BUTTONS_PER_BUBBLE);

    const title =
      totalBubbles > 1
        ? `${categoryName} (${bubbleIndex}/${totalBubbles})`
        : categoryName;

    bubbles.push(createCategoryBubble(title, chunk, periodText));
  }

  return bubbles;
}

/**
 * 카테고리명 반환
 */
function getCategoryName(category: 'CSO' | 'HOSPITAL' | 'DRUG'): string {
  switch (category) {
    case 'CSO':
      return 'CSO';
    case 'HOSPITAL':
      return '병원';
    case 'DRUG':
      return '품목';
  }
}

/**
 * 개별 카테고리 버블 생성
 */
function createCategoryBubble(
  title: string,
  items: SearchIndexResult[],
  periodText: string
): any {
  const buttons = items.map((item, index) => {
    const label = getButtonLabel(item);
    const postbackData = createPostbackForItem(item);

    return {
      type: 'button',
      action: {
        type: 'postback',
        label: label.length > 20 ? label.slice(0, 18) + '..' : label,
        data: encodePostback(postbackData),
      },
      style: index % 2 === 0 ? 'primary' : 'secondary',
      height: 'sm',
      color: index % 2 === 0 ? COLORS.navy : COLORS.lightBlue,
      margin: 'sm',
    };
  });

  return {
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
          align: 'center',
        },
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '8px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'image',
          url: LOGO_URL,
          size: 'sm',
          aspectRatio: '5:3',
          aspectMode: 'fit',
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: title,
              size: 'md',
              color: COLORS.text,
              weight: 'bold',
              align: 'center',
            },
            {
              type: 'text',
              text: periodText,
              size: 'xxs',
              color: COLORS.lightGray,
              align: 'center',
              margin: 'xs',
            },
            {
              type: 'separator',
              margin: 'md',
              color: COLORS.border,
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: buttons,
              margin: 'md',
            },
          ],
          backgroundColor: COLORS.white,
          cornerRadius: '12px',
          paddingAll: '16px',
          margin: 'md',
        },
      ],
      backgroundColor: COLORS.background,
      paddingAll: '12px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: ' ',
          size: 'xxs',
          color: COLORS.white,
          align: 'center',
        },
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '6px',
    },
  };
}

/**
 * 버튼 라벨 생성
 */
function getButtonLabel(item: SearchIndexResult): string {
  // search_abbr이 있으면 우선 사용
  if (item.search_abbr) {
    return item.search_abbr;
  }
  return item.search_name;
}

/**
 * 아이템별 postback 데이터 생성
 */
function createPostbackForItem(item: SearchIndexResult) {
  switch (item.entity_type) {
    case 'CSO':
      return createCsoPostback(item.entity_cd);
    case 'HOSPITAL':
      // entity_cd는 hos_cd|hos_cso_cd 형식
      const [hos_cd, hos_cso_cd] = item.entity_cd.split('|');
      return createHospitalPostback(hos_cd, hos_cso_cd);
    case 'DRUG':
      return createDrugPostback(item.entity_cd);
  }
}

/**
 * 요약 버블 생성
 */
function createSummaryBubble(keyword: string, result: SearchResult): any {
  const statusContents: any[] = [];

  statusContents.push({
    type: 'text',
    text: `"${keyword}" 검색 결과`,
    size: 'md',
    color: COLORS.text,
    weight: 'bold',
    align: 'center',
  });

  statusContents.push({
    type: 'separator',
    margin: 'md',
    color: COLORS.border,
  });

  // 카테고리별 검색 결과 수
  const rows: any[] = [];

  if (result.csoCount > 0) {
    rows.push(createStatusRow('CSO', `${result.csoCount}건`));
  }
  if (result.hospitalCount > 0) {
    rows.push(createStatusRow('병원', `${result.hospitalCount}건`));
  }
  if (result.drugCount > 0) {
    rows.push(createStatusRow('품목', `${result.drugCount}건`));
  }

  if (rows.length > 0) {
    statusContents.push({
      type: 'box',
      layout: 'vertical',
      contents: rows,
      margin: 'md',
    });
  }

  // 총 결과 수
  statusContents.push({
    type: 'separator',
    margin: 'md',
    color: COLORS.border,
  });

  statusContents.push({
    type: 'text',
    text: `총 ${result.totalCount}건`,
    size: 'sm',
    color: COLORS.navy,
    weight: 'bold',
    align: 'center',
    margin: 'md',
  });

  return {
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
          align: 'center',
        },
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '8px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'image',
          url: LOGO_URL,
          size: 'sm',
          aspectRatio: '5:3',
          aspectMode: 'fit',
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: statusContents,
          backgroundColor: COLORS.white,
          cornerRadius: '12px',
          paddingAll: '16px',
          margin: 'md',
        },
      ],
      backgroundColor: COLORS.background,
      paddingAll: '12px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: ' ',
          size: 'xxs',
          color: COLORS.white,
          align: 'center',
        },
      ],
      backgroundColor: COLORS.darkNavy,
      paddingAll: '6px',
    },
  };
}

/**
 * 상태 행 생성
 */
function createStatusRow(label: string, value: string): any {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: COLORS.subtext, flex: 1 },
      {
        type: 'text',
        text: value,
        size: 'sm',
        weight: 'bold',
        color: COLORS.navy,
        align: 'end',
        flex: 2,
      },
    ],
    margin: 'md',
  };
}
