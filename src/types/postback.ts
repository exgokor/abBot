/**
 * 통합 Postback 데이터 타입 정의
 *
 * Depth 구조:
 * - Depth 1: 텍스트 검색 (postback 없음)
 * - Depth 2: 단일 Entity (CSO, HOSPITAL, DRUG)
 * - Depth 3: 복합 Entity (CSO|HOSPITAL, CSO|DRUG, HOSPITAL|DRUG, HOSPITAL|CSO, DRUG|HOSPITAL, DRUG|CSO)
 */

// Entity 타입
export type EntityType = 'CSO' | 'HOSPITAL' | 'DRUG';

// Depth2 단일 Entity 타입
export type Depth2EntityType = EntityType;

// Depth3 복합 Entity 타입
export type Depth3EntityType =
  | 'CSO|HOSPITAL'
  | 'CSO|DRUG'
  | 'HOSPITAL|DRUG'
  | 'HOSPITAL|CSO'
  | 'DRUG|HOSPITAL'
  | 'DRUG|CSO';

// Postback 데이터 인터페이스
export interface PostbackData {
  d: 2 | 3;              // Depth
  t: Depth2EntityType | Depth3EntityType;  // entity_type
  c: string;             // entity_code
}

// Depth2 Postback
export interface Depth2Postback extends PostbackData {
  d: 2;
  t: Depth2EntityType;
  c: string;  // CSO: cso_cd, HOSPITAL: hos_cd|hos_cso_cd, DRUG: drug_cd
}

// Depth3 Postback
export interface Depth3Postback extends PostbackData {
  d: 3;
  t: Depth3EntityType;
  c: string;  // 복합코드: entity1_code||entity2_code (HOSPITAL은 hos_cd|hos_cso_cd)
}

/**
 * Postback 데이터를 JSON 문자열로 인코딩
 */
export function encodePostback(data: PostbackData): string {
  return JSON.stringify(data);
}

/**
 * JSON 문자열을 Postback 데이터로 디코딩
 */
export function decodePostback(dataStr: string): PostbackData | null {
  try {
    const parsed = JSON.parse(dataStr);
    if (parsed.d && parsed.t && parsed.c) {
      return parsed as PostbackData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Depth2 CSO postback 생성
 */
export function createCsoPostback(cso_cd: string): Depth2Postback {
  return { d: 2, t: 'CSO', c: cso_cd };
}

/**
 * Depth2 HOSPITAL postback 생성
 */
export function createHospitalPostback(hos_cd: string, hos_cso_cd: string): Depth2Postback {
  return { d: 2, t: 'HOSPITAL', c: `${hos_cd}|${hos_cso_cd}` };
}

/**
 * Depth2 DRUG postback 생성
 */
export function createDrugPostback(drug_cd: string): Depth2Postback {
  return { d: 2, t: 'DRUG', c: drug_cd };
}

/**
 * Depth3 CSO|HOSPITAL postback 생성
 */
export function createCsoHospitalPostback(cso_cd: string, hos_cd: string, hos_cso_cd: string): Depth3Postback {
  return { d: 3, t: 'CSO|HOSPITAL', c: `${cso_cd}||${hos_cd}|${hos_cso_cd}` };
}

/**
 * Depth3 CSO|DRUG postback 생성
 */
export function createCsoDrugPostback(cso_cd: string, drug_cd: string): Depth3Postback {
  return { d: 3, t: 'CSO|DRUG', c: `${cso_cd}||${drug_cd}` };
}

/**
 * Depth3 HOSPITAL|DRUG postback 생성
 */
export function createHospitalDrugPostback(hos_cd: string, hos_cso_cd: string, drug_cd: string): Depth3Postback {
  return { d: 3, t: 'HOSPITAL|DRUG', c: `${hos_cd}|${hos_cso_cd}||${drug_cd}` };
}

/**
 * Depth3 HOSPITAL|CSO postback 생성
 */
export function createHospitalCsoPostback(hos_cd: string, hos_cso_cd: string, cso_cd: string): Depth3Postback {
  return { d: 3, t: 'HOSPITAL|CSO', c: `${hos_cd}|${hos_cso_cd}||${cso_cd}` };
}

/**
 * Depth3 DRUG|HOSPITAL postback 생성
 */
export function createDrugHospitalPostback(drug_cd: string, hos_cd: string, hos_cso_cd: string): Depth3Postback {
  return { d: 3, t: 'DRUG|HOSPITAL', c: `${drug_cd}||${hos_cd}|${hos_cso_cd}` };
}

/**
 * Depth3 DRUG|CSO postback 생성
 */
export function createDrugCsoPostback(drug_cd: string, cso_cd: string): Depth3Postback {
  return { d: 3, t: 'DRUG|CSO', c: `${drug_cd}||${cso_cd}` };
}

/**
 * Depth3 코드 파싱 헬퍼
 * entity_code를 ||로 분리하여 각 entity의 코드를 반환
 */
export function parseDepth3Code(entityType: Depth3EntityType, entityCode: string): {
  first: string;
  second: string;
  firstHosCd?: string;
  firstHosCsoCd?: string;
  secondHosCd?: string;
  secondHosCsoCd?: string;
} {
  const [first, second] = entityCode.split('||');
  const result: ReturnType<typeof parseDepth3Code> = { first, second };

  // HOSPITAL이 첫번째인 경우 (HOSPITAL|DRUG, HOSPITAL|CSO)
  if (entityType.startsWith('HOSPITAL|')) {
    const [hosCd, hosCsoCd] = first.split('|');
    result.firstHosCd = hosCd;
    result.firstHosCsoCd = hosCsoCd;
  }

  // HOSPITAL이 두번째인 경우 (CSO|HOSPITAL, DRUG|HOSPITAL)
  if (entityType.endsWith('|HOSPITAL')) {
    const [hosCd, hosCsoCd] = second.split('|');
    result.secondHosCd = hosCd;
    result.secondHosCsoCd = hosCsoCd;
  }

  return result;
}

/**
 * HOSPITAL 코드 파싱 헬퍼 (hos_cd|hos_cso_cd 형식)
 */
export function parseHospitalCode(code: string): { hos_cd: string; hos_cso_cd: string } {
  const [hos_cd, hos_cso_cd] = code.split('|');
  return { hos_cd, hos_cso_cd };
}
