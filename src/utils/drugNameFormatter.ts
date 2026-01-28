/**
 * 품목명(제품명) 텍스트 정리 유틸리티
 *
 * 규칙:
 * 1. '캡슐' 문자열 제거
 * 2. '정\d+$' 패턴 (끝에 '정' + 숫자) → 전체 제거
 * 3. '정\d+' 패턴 (끝이 아닌 경우) → '정'만 제거 (숫자는 유지)
 * 4. '점안액' → '💧' 이모지로 변환
 *
 * 추후 규칙 수정 시 이 파일만 수정하면 됩니다.
 */

/**
 * 품목명 텍스트 정리
 * @param drugName 원본 품목명
 * @returns 정리된 품목명
 */
export function formatDrugName(drugName: string): string {
  let result = drugName;

  // 규칙 1: '캡슐' 제거
  result = result.replace(/캡슐/g, '');

  // 규칙 2: 끝에 '정\d+' 패턴이 있으면 전체 제거 (예: "약품정30" → "약품")
  result = result.replace(/정\d+$/g, '');

  // 규칙 3: 끝이 아닌 곳의 '정\d+' 패턴에서 '정'만 제거 (예: "약품정30mg" → "약품30mg")
  // 주의: 규칙 2를 먼저 적용했으므로 여기서는 끝이 아닌 패턴만 남음
  result = result.replace(/정(\d+)/g, '$1');

  // 규칙 4: '점안액' → '💧' 이모지로 변환
  result = result.replace(/점안액/g, '💧');

  // 공백 정리 (연속 공백 제거, 앞뒤 공백 제거)
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}
