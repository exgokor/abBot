/**
 * 페이지 접근용 토큰 서비스
 * 블록 수정 페이지 등 외부 접근 시 사용
 */

import crypto from 'crypto';
import { getConnection } from '../database/connection';
import sql from 'mssql';
import { logger } from '../../utils/logger';

export interface PageTokenData {
  uuid: string;
  token: string;
  hos_cd: string;
  hos_cso_cd: string;
  user_id: string;
  expires_at: Date;
}

/**
 * 페이지 접근 토큰 생성
 * DB에 저장하고 uuid/token 반환
 */
export async function createPageToken(
  hos_cd: string,
  hos_cso_cd: string,
  userId: string,
  expiresInMinutes: number = 30
): Promise<{ uuid: string; token: string }> {
  const pool = await getConnection();

  const uuid = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  await pool.request()
    .input('uuid', sql.NVarChar, uuid)
    .input('token', sql.NVarChar, token)
    .input('hos_cd', sql.NVarChar, hos_cd)
    .input('hos_cso_cd', sql.NVarChar, hos_cso_cd)
    .input('user_id', sql.NVarChar, userId)
    .input('expires_at', sql.DateTime, expiresAt)
    .query(`
      INSERT INTO PageTokens (uuid, token, hos_cd, hos_cso_cd, user_id, expires_at, created_at)
      VALUES (@uuid, @token, @hos_cd, @hos_cso_cd, @user_id, @expires_at, GETDATE())
    `);

  logger.info(`Page token created for hospital ${hos_cd}|${hos_cso_cd}, user ${userId}`);

  return { uuid, token };
}

/**
 * 토큰 검증 및 데이터 조회
 */
export async function validatePageToken(
  uuid: string,
  token: string
): Promise<PageTokenData | null> {
  const pool = await getConnection();

  // 먼저 uuid로만 조회해서 토큰 존재 여부 확인
  const checkResult = await pool.request()
    .input('uuid', sql.NVarChar, uuid)
    .query(`
      SELECT uuid, token, hos_cd, hos_cso_cd, user_id, expires_at, GETDATE() as now
      FROM PageTokens
      WHERE uuid = @uuid
    `);

  if (checkResult.recordset.length === 0) {
    logger.warn(`[validatePageToken] uuid not found in DB: ${uuid}`);
    return null;
  }

  const record = checkResult.recordset[0];
  logger.info(`[validatePageToken] Found record - expires_at: ${record.expires_at}, now: ${record.now}`);

  // 토큰 일치 확인
  if (record.token !== token) {
    logger.warn(`[validatePageToken] Token mismatch for uuid: ${uuid}`);
    return null;
  }

  // 만료 확인
  if (new Date(record.expires_at) < new Date(record.now)) {
    logger.warn(`[validatePageToken] Token expired for uuid: ${uuid}`);
    return null;
  }

  return record as PageTokenData;
}

/**
 * 만료된 토큰 정리 (선택적)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const pool = await getConnection();

  const result = await pool.request()
    .query(`
      DELETE FROM PageTokens WHERE expires_at < GETDATE()
    `);

  return result.rowsAffected[0] || 0;
}
