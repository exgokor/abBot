/**
 * 매출 금액 포맷팅 공통 유틸리티
 *
 * 규칙:
 * - 천만원 이상: 정수 백만 단위 (예: 12백만)
 * - 천만원 미만: 소수 첫째자리 (예: 5.2백만)
 * - 4자리 이상이면 천단위 콤마 (예: 1,234백만)
 */

/**
 * 금액을 백만 단위로 포맷팅
 * @param amount 원 단위 금액
 * @returns 포맷팅된 문자열 (예: "5.2백만", "12백만", "1,234백만")
 */
export function formatSalesMoney(amount: number): string {
  const millions = amount / 1000000;

  // 천만원 이상 (10백만 이상): 정수로 표시
  if (millions >= 10) {
    const rounded = Math.round(millions);
    // 4자리 이상이면 천단위 콤마
    if (rounded >= 1000) {
      return `${rounded.toLocaleString()}백만`;
    }
    return `${rounded}백만`;
  }

  // 천만원 미만: 소수 첫째자리
  return `${millions.toFixed(1)}백만`;
}

/**
 * 금액을 정수 백만 단위로 포맷팅 (간단 표시용)
 * @param amount 원 단위 금액
 * @returns 포맷팅된 문자열 (예: "5백만", "12백만")
 */
export function formatMoneyInt(amount: number): string {
  const millions = Math.round(amount / 1000000);
  if (millions >= 1000) {
    return `${millions.toLocaleString()}백만`;
  }
  return `${millions}백만`;
}

/**
 * 월별 매출 추이를 문자열로 포맷팅
 * @param monthlySales 월별 매출 배열 (원 단위)
 * @returns 포맷팅된 문자열 (예: "5.2 → 6.1 → 7.3")
 */
export function formatMonthlyTrend(monthlySales: number[]): string {
  if (monthlySales.length === 0) return '-';

  return monthlySales.map(sales => {
    const millions = sales / 1000000;
    // 천만원 이상이면 정수, 미만이면 소수 첫째자리
    if (millions >= 10) {
      return Math.round(millions).toString();
    }
    return millions.toFixed(1);
  }).join(' → ');
}

/**
 * 1년 데이터용 3포인트 추이 포맷팅 (시작/중간/종료)
 * @param monthlySales 월별 매출 배열 (원 단위)
 * @param periodMonths 기간 개월수
 * @param startIndex 시작 sales_index
 * @returns { trend: string, labels: string } - 추이 텍스트와 년월 레이블
 */
export function formatYearlyTrend(
  monthlySales: number[],
  periodMonths: number,
  startIndex: number
): { trend: string; labels: string } {
  if (monthlySales.length === 0) {
    return { trend: '-', labels: '' };
  }

  const formatValue = (value: number): string => {
    const millions = value / 1000000;
    if (millions >= 10) {
      return Math.round(millions).toString();
    }
    return millions.toFixed(1);
  };

  const indexToYearMonth = (idx: number): string => {
    const year = 2000 + Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    return `${year % 100}년${month}월`;
  };

  if (monthlySales.length <= 2) {
    // 2개 이하면 전체 표시
    const trend = monthlySales.map(formatValue).join(' → ');
    const endIndex = startIndex + monthlySales.length - 1;
    const labels = `(${indexToYearMonth(startIndex)} → ${indexToYearMonth(endIndex)})`;
    return { trend, labels };
  }

  // 3개 이상: 시작/중간/종료 표시
  const firstSales = monthlySales[0];
  const midIndex = Math.floor(monthlySales.length / 2);
  const midSales = monthlySales[midIndex];
  const lastSales = monthlySales[monthlySales.length - 1];

  const trend = `${formatValue(firstSales)} → ${formatValue(midSales)} → ${formatValue(lastSales)}`;

  const startLabel = indexToYearMonth(startIndex);
  const midLabel = indexToYearMonth(startIndex + midIndex);
  const endLabel = indexToYearMonth(startIndex + monthlySales.length - 1);
  const labels = `(${startLabel} → ${midLabel} → ${endLabel})`;

  return { trend, labels };
}

/**
 * 월평균 매출 계산 및 포맷팅
 * @param monthlySales 월별 매출 배열 (원 단위)
 * @returns 포맷팅된 문자열 (예: "평균 5.2백만")
 */
export function formatMonthlyAvg(monthlySales: number[]): string {
  if (monthlySales.length === 0) return '-';

  const total = monthlySales.reduce((sum, sales) => sum + sales, 0);
  const avg = total / monthlySales.length;

  return formatSalesMoney(avg);
}

/**
 * 약품별 월별 추이 포맷팅 (3개월/6개월용)
 * @param monthlySales 월별 매출 배열 (원 단위)
 * @returns 포맷팅된 문자열 (예: "5.2 → 6.1 → 7.3")
 */
export function formatDrugMonthlyTrend(monthlySales: number[]): string {
  if (monthlySales.length === 0) return '-';

  return monthlySales.map(sales => {
    const millions = sales / 1000000;
    // 10백만 이상이면 정수, 미만이면 소수 첫째자리
    if (millions >= 10) {
      return Math.round(millions).toString();
    }
    return millions.toFixed(1);
  }).join(' → ');
}
