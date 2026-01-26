/**
 * 기간 계산 유틸리티
 *
 * SALES_TBL의 MAX(sales_index)를 기준으로 조회 기간을 계산합니다.
 * sales_index: 2000년 1월 = 0, (year - 2000) * 12 + (month - 1)
 */

import { executeQuery } from '../database/queries';
import { logger } from '../../utils/logger';

export interface PeriodInfo {
  startIndex: number;
  endIndex: number;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  periodText: string;  // "2024.10 ~ 2024.12" 형식
  periodMonths: number;
}

/**
 * sales_index를 연/월로 변환
 */
export function indexToYearMonth(index: number): { year: number; month: number } {
  const year = 2000 + Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month };
}

/**
 * 연/월을 sales_index로 변환
 */
export function yearMonthToIndex(year: number, month: number): number {
  return (year - 2000) * 12 + (month - 1);
}

/**
 * 현재 기준 기간 정보 조회 (기본 3개월)
 */
export async function getCurrentPeriod(months: number = 3): Promise<PeriodInfo> {
  try {
    const result = await executeQuery<{ max_index: number }>(
      `SELECT MAX(sales_index) AS max_index FROM SALES_TBL`
    );

    if (!result || result.length === 0 || result[0].max_index === null) {
      throw new Error('SALES_TBL에서 sales_index를 조회할 수 없습니다.');
    }

    const endIndex = result[0].max_index;
    const startIndex = endIndex - (months - 1);

    const { year: startYear, month: startMonth } = indexToYearMonth(startIndex);
    const { year: endYear, month: endMonth } = indexToYearMonth(endIndex);

    const periodText = `${startYear}.${String(startMonth).padStart(2, '0')} ~ ${endYear}.${String(endMonth).padStart(2, '0')}`;

    return {
      startIndex,
      endIndex,
      startYear,
      startMonth,
      endYear,
      endMonth,
      periodText,
      periodMonths: months,
    };
  } catch (error) {
    logger.error('getCurrentPeriod error:', error);
    throw error;
  }
}

/**
 * 기간 텍스트 생성 (간단 버전)
 */
export function formatPeriodText(startIndex: number, endIndex: number): string {
  const { year: startYear, month: startMonth } = indexToYearMonth(startIndex);
  const { year: endYear, month: endMonth } = indexToYearMonth(endIndex);

  return `${startYear}.${String(startMonth).padStart(2, '0')} ~ ${endYear}.${String(endMonth).padStart(2, '0')}`;
}

/**
 * 월별 매출 트렌드 텍스트 생성 (00 > 00 > 00 형식)
 * @param sales 월별 매출 배열 (3개월분)
 * @param formatter 금액 포맷 함수
 */
export function formatTrendText(sales: number[], formatter: (n: number) => string): string {
  return sales.map(s => formatter(s)).join(' > ');
}

/**
 * 월평균 계산
 */
export function calculateMonthlyAverage(totalSales: number, months: number): number {
  return Math.round(totalSales / months);
}
