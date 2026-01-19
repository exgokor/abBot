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

export async function getUserPermission(userId: string): Promise<UserPermission | null> {
  try {
    const result = await executeQuery<{ userId: string; role: string }>(
      `SELECT userId, role FROM UserPermissions WHERE userId = @userId`,
      { userId }
    );

    if (result.length === 0) {
      return { userId, role: UserRole.USER }; // 기본 권한
    }

    return {
      userId: result[0].userId,
      role: result[0].role as UserRole,
    };
  } catch (error) {
    logger.error(`Failed to get user permission for ${userId}`, error);
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
