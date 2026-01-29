/**
 * 의약품 정보 서비스
 * 의약품 기본 정보 조회 및 버블 생성
 */

import { getConnection } from '../database/connection';
import { COLORS, LOGO_URL, createHeader, createFooter } from '../../utils/bubbleBuilder';
import sql from 'mssql';

// 의약품 상세 정보 인터페이스
export interface DrugInfo {
  drug_cd: string;
  drug_name: string;
  drug_price: number;
  drug_totRate: number;
  drug_dpRate: number;
  drug_category: string | null;
  drug_type: string | null;
  drug_ingr: string | null;
  drug_ingr_eng: string | null;
  drug_manufac: string | null;
  drug_manufac_type: string | null;
}

/**
 * drug_cd로 의약품 정보 조회 (end_index가 MAX인 것만)
 */
export async function getDrugInfo(drug_cd: string): Promise<DrugInfo | null> {
  const pool = await getConnection();

  const result = await pool.request()
    .input('drug_cd', sql.NVarChar, drug_cd)
    .query(`
      SELECT TOP 1
        drug_cd,
        drug_name,
        drug_price,
        drug_totRate,
        drug_dpRate,
        drug_category,
        drug_type,
        drug_ingr,
        drug_ingr_eng,
        drug_manufac,
        drug_manufac_type
      FROM DRUG_TBL
      WHERE drug_cd = @drug_cd
      ORDER BY end_index DESC
    `);

  if (result.recordset.length === 0) {
    return null;
  }

  return result.recordset[0] as DrugInfo;
}

/**
 * 의약품 정보 버블 생성
 * @param drug 의약품 정보
 * @param isAdmin ADMIN/SUPER_ADMIN 여부 (true면 drug_totRate 표시)
 */
export function createDrugInfoBubble(drug: DrugInfo, isAdmin: boolean = false): any {
  // 태그 생성 헬퍼 - 네이비 (제약사, 계열)
  const createNavyTag = (text: string) => ({
    type: 'box',
    layout: 'vertical',
    contents: [{
      type: 'text',
      text: text,
      size: 'xxs',
      color: COLORS.white,
      align: 'center',
    }],
    backgroundColor: COLORS.navy,
    cornerRadius: '4px',
    paddingAll: '4px',
    paddingStart: '8px',
    paddingEnd: '8px',
  });

  // 태그 생성 헬퍼 - 하늘색 (생산여부, 타겟질환)
  const createLightTag = (text: string) => ({
    type: 'box',
    layout: 'vertical',
    contents: [{
      type: 'text',
      text: text,
      size: 'xxs',
      color: COLORS.text,
      align: 'center',
    }],
    backgroundColor: COLORS.lightBlue,
    cornerRadius: '4px',
    paddingAll: '4px',
    paddingStart: '8px',
    paddingEnd: '8px',
  });

  // 첫 번째 흰색 상자: 제품명, 제약사/생산여부, 약가, 수수료율
  const firstBoxContents: any[] = [];

  // 제품명
  firstBoxContents.push({
    type: 'text',
    text: drug.drug_name,
    size: 'md',
    color: COLORS.text,
    weight: 'bold',
    wrap: true,
    align: 'center',
  });

  // 제약사 + 생산여부 태그
  const firstTags: any[] = [];
  if (drug.drug_manufac) {
    firstTags.push(createNavyTag(drug.drug_manufac));
  }
  if (drug.drug_manufac_type) {
    firstTags.push(createLightTag(drug.drug_manufac_type));
  }

  if (firstTags.length > 0) {
    firstBoxContents.push({
      type: 'box',
      layout: 'horizontal',
      contents: firstTags,
      spacing: 'sm',
      margin: 'md',
      justifyContent: 'center',
    });
  }

  // 구분선
  firstBoxContents.push({
    type: 'separator',
    margin: 'lg',
    color: COLORS.border,
  });

  // 약가
  firstBoxContents.push({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: '약가', size: 'sm', color: COLORS.subtext, flex: 1 },
      { type: 'text', text: `${drug.drug_price?.toLocaleString() || '-'}원`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end', flex: 2 },
    ],
    margin: 'lg',
  });

  // 수수료율 (관리자용) - ADMIN/SUPER_ADMIN만
  if (isAdmin && drug.drug_totRate != null) {
    firstBoxContents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: '수수료율(관리자용)', size: 'sm', color: COLORS.subtext, flex: 2 },
        { type: 'text', text: `${(drug.drug_totRate * 100).toFixed(1)}%`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end', flex: 1 },
      ],
      margin: 'md',
    });
  }

  // 수수료율 (딜러공개용)
  if (drug.drug_dpRate != null) {
    firstBoxContents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: '수수료율', size: 'sm', color: COLORS.subtext, flex: 1 },
        { type: 'text', text: `${(drug.drug_dpRate * 100).toFixed(1)}%`, size: 'sm', weight: 'bold', color: COLORS.text, align: 'end', flex: 2 },
      ],
      margin: 'md',
    });
  }

  // 두 번째 흰색 상자: 계열/타겟질환, 성분명
  const secondBoxContents: any[] = [];

  // 계열 + 타겟질환 태그
  const secondTags: any[] = [];
  if (drug.drug_category) {
    secondTags.push(createNavyTag(drug.drug_category));
  }
  if (drug.drug_type) {
    secondTags.push(createLightTag(drug.drug_type));
  }

  if (secondTags.length > 0) {
    secondBoxContents.push({
      type: 'box',
      layout: 'horizontal',
      contents: secondTags,
      spacing: 'sm',
      justifyContent: 'center',
    });
  }

  // 성분명
  if (drug.drug_ingr) {
    secondBoxContents.push({
      type: 'text',
      text: drug.drug_ingr,
      size: 'sm',
      color: COLORS.text,
      weight: 'bold',
      wrap: true,
      align: 'center',
      margin: secondTags.length > 0 ? 'lg' : 'none',
    });
  }

  // 성분명 (영어)
  if (drug.drug_ingr_eng) {
    secondBoxContents.push({
      type: 'text',
      text: drug.drug_ingr_eng,
      size: 'xs',
      color: COLORS.subtext,
      wrap: true,
      align: 'center',
      margin: 'sm',
    });
  }

  // 버블 생성
  const bubble: any = {
    type: 'bubble',
    header: createHeader(drug.drug_name),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        // 로고
        {
          type: 'image',
          url: LOGO_URL,
          size: 'sm',
          aspectRatio: '5:3',
          aspectMode: 'fit',
        },
        // 첫 번째 흰색 상자
        {
          type: 'box',
          layout: 'vertical',
          contents: firstBoxContents,
          backgroundColor: COLORS.white,
          cornerRadius: '12px',
          paddingAll: '16px',
          margin: 'md',
        },
        // 두 번째 흰색 상자 (성분 정보가 있는 경우만)
        ...(secondBoxContents.length > 0 ? [{
          type: 'box',
          layout: 'vertical',
          contents: secondBoxContents,
          backgroundColor: COLORS.white,
          cornerRadius: '12px',
          paddingAll: '16px',
          margin: 'md',
        }] : []),
      ],
      backgroundColor: COLORS.background,
      paddingAll: '12px',
    },
    footer: createFooter(),
  };

  return bubble;
}
