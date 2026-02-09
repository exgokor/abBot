import { Request, Response, NextFunction } from 'express';
import { executeQuery } from '../services/database/queries';
import { logger } from '../utils/logger';

export enum UserRole {
  USER = 'USER',           // 일반유저: 본인 정보만 조회
  ADMIN = 'ADMIN',         // 관리자: 전체 정보 조회 가능
  SUPER_ADMIN = 'SUPER_ADMIN', // 최종관리자: 전체 조회 + DB 수정 가능
}

export interface UserPermission {
  userId: string;
  role: UserRole;
}

export interface UserAllowedEntities {
  csoCodes: string[];       // 유저 소속 CSO 코드 목록
  hospitalKeys: string[];   // 담당 병원 키 목록 (hos_cd|hos_cso_cd)
}

// 권한 캐시 (userId -> { permission, expiresAt })
const permissionCache = new Map<string, { permission: UserPermission; expiresAt: number }>();
// 허용 엔티티 캐시 (userId -> { entities, expiresAt })
const entitiesCache = new Map<string, { entities: UserAllowedEntities; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

export async function getUserPermission(userId: string): Promise<UserPermission | null> {
  // 캐시 확인
  const cached = permissionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permission;
  }

  try {
    const result = await executeQuery<{ userId: string; role: string }>(
      `SELECT userId, role FROM UserPermissions WHERE userId = @userId`,
      { userId }
    );

    const permission: UserPermission = result.length === 0
      ? { userId, role: UserRole.USER }
      : { userId: result[0].userId, role: result[0].role as UserRole };

    // 캐시에 저장
    permissionCache.set(userId, {
      permission,
      expiresAt: Date.now() + CACHE_TTL_MS
    });

    return permission;
  } catch (error) {
    logger.error(`Failed to get user permission for ${userId}`, error);
    return null;
  }
}

/**
 * 일반유저(USER)의 허용 엔티티 조회
 * NaverWorks_UserInfo_TBL → CSO_TBL (email 조인) → BLOCK_TBL (담당 병원)
 */
export async function getUserAllowedEntities(userId: string): Promise<UserAllowedEntities | null> {
  // 캐시 확인
  const cached = entitiesCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.entities;
  }

  try {
    // 1. 유저의 CSO 코드 목록 조회
    const csoCodes = await executeQuery<{ cso_cd: string }>(
      `SELECT c.cso_cd
       FROM NaverWorks_UserInfo_TBL u
       JOIN CSO_TBL c ON c.cso_email = u.email
       WHERE u.userId = @userId AND c.cso_is_valid = 'Y'`,
      { userId }
    );

    const csoCodeList = csoCodes.map(r => r.cso_cd);

    // CSO가 없으면 빈 결과 반환
    if (csoCodeList.length === 0) {
      const entities: UserAllowedEntities = { csoCodes: [], hospitalKeys: [] };
      entitiesCache.set(userId, { entities, expiresAt: Date.now() + CACHE_TTL_MS });
      return entities;
    }

    // 2. 해당 CSO들의 담당 병원 키 목록 조회 (BLOCK_TBL)
    const csoPlaceholders = csoCodeList.map((_, i) => `@cso${i}`).join(', ');
    const params: Record<string, unknown> = { userId };
    csoCodeList.forEach((code, i) => { params[`cso${i}`] = code; });

    const hospitals = await executeQuery<{ hospital_key: string }>(
      `SELECT DISTINCT hos_cd + '|' + hos_cso_cd AS hospital_key
       FROM BLOCK_TBL
       WHERE cso_cd IN (${csoPlaceholders}) AND block_isvalid = 'Y'`,
      params
    );

    const entities: UserAllowedEntities = {
      csoCodes: csoCodeList,
      hospitalKeys: hospitals.map(r => r.hospital_key),
    };

    entitiesCache.set(userId, { entities, expiresAt: Date.now() + CACHE_TTL_MS });
    return entities;
  } catch (error) {
    logger.error(`Failed to get allowed entities for ${userId}`, error);
    return null;
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.body?.source?.userId;

    if (!userId) {
      res.status(401).json({ error: 'User not identified' });
      return;
    }

    const permission = await getUserPermission(userId);

    if (!permission || !roles.includes(permission.role)) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    (req as Request & { userPermission: UserPermission }).userPermission = permission;
    next();
  };
}
