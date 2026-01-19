import sql from 'mssql';
import { refreshAccessToken } from '../naverworks/auth';
import { usersList } from '../naverworks/message';
import { getConnection } from './connection';
import { logger } from '../../utils/logger';

// Super Admin 대상자 목록 (확장 가능 - 이름 추가하면 됨)
const SUPER_ADMIN_NAMES = ['이정재'];

type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

/**
 * 사용자 권한 결정
 * 1. 정규직 + SUPER_ADMIN_NAMES에 포함 → SUPER_ADMIN
 * 2. 정규직 → ADMIN
 * 3. 그 외 → USER
 */
function determineUserRole(fullName: string, employmentType: string): UserRole {
  if (employmentType === '정규직' && SUPER_ADMIN_NAMES.includes(fullName)) {
    return 'SUPER_ADMIN';
  }
  if (employmentType === '정규직') {
    return 'ADMIN';
  }
  return 'USER';
}

/**
 * 정기 작업 메인 함수
 * 1. 토큰 갱신
 * 2. 사용자 정보 동기화
 */
export async function runScheduledTasks(): Promise<void> {
  // 1. Refresh Token 갱신 (새 access_token + refresh_token 저장)
  console.log('[1/2] Refreshing tokens...');
  await refreshAccessToken();
  console.log('✓ Tokens refreshed');

  // 2. 사용자 정보 동기화
  console.log('[2/2] Syncing user info...');
  await syncNaverWorksUsers();
  console.log('✓ User info synced');
}

/**
 * 사용자 정보 DB 동기화 (TRUNCATE + INSERT)
 */
export async function syncNaverWorksUsers(): Promise<void> {
  const users = await usersList();
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();
  try {
    // 테이블 비우기
    await transaction.request().query('TRUNCATE TABLE NaverWorks_UserInfo_TBL');

    // 사용자 정보 INSERT (권한 포함)
    for (const user of users) {
      const role = determineUserRole(user.fullName, user.type);

      await transaction
        .request()
        .input('userId', sql.VarChar(100), user.userID)
        .input('email', sql.VarChar(255), user.email)
        .input('fullName', sql.NVarChar(100), user.fullName)
        .input('employmentType', sql.NVarChar(50), user.type)
        .input('birthday', sql.VarChar(20), user.birthday)
        .input('birthType', sql.VarChar(20), user.birthType)
        .input('orgUnitName', sql.NVarChar(100), user.positionName)
        .input('levelName', sql.NVarChar(50), user.level)
        .input('positionName', sql.NVarChar(50), user.position)
        .input('role', sql.VarChar(20), role)
        .query(`INSERT INTO NaverWorks_UserInfo_TBL
          (userId, email, fullName, employmentType, birthday, birthType,
           orgUnitName, levelName, positionName, role)
          VALUES (@userId, @email, @fullName, @employmentType, @birthday,
                  @birthType, @orgUnitName, @levelName, @positionName, @role)`);
    }

    await transaction.commit();
    console.log(`Synced ${users.length} users`);
    logger.info(`NaverWorks user sync completed: ${users.length} users`);
  } catch (error) {
    await transaction.rollback();
    logger.error('User sync failed:', error);
    throw error;
  }
}

/**
 * NaverWorks_UserInfo_TBL 테이블 생성 (role 컬럼 포함)
 * 기존 테이블이 있으면 DROP 후 재생성
 */
export async function createUserInfoTable(): Promise<void> {
  const pool = await getConnection();

  // 기존 테이블 DROP 후 재생성 (스키마 변경 반영)
  const createTableSQL = `
    IF EXISTS (SELECT * FROM sysobjects WHERE name='NaverWorks_UserInfo_TBL' AND xtype='U')
      DROP TABLE NaverWorks_UserInfo_TBL;

    CREATE TABLE NaverWorks_UserInfo_TBL (
      userId          VARCHAR(100) PRIMARY KEY,
      email           VARCHAR(255),
      fullName        NVARCHAR(100),
      employmentType  NVARCHAR(50),
      birthday        VARCHAR(20),
      birthType       VARCHAR(20),
      orgUnitName     NVARCHAR(100),
      levelName       NVARCHAR(50),
      positionName    NVARCHAR(50),
      role            VARCHAR(20) DEFAULT 'USER',
      syncedAt        DATETIME DEFAULT GETDATE()
    )
  `;

  await pool.request().query(createTableSQL);
  console.log('✓ NaverWorks_UserInfo_TBL table created (with role column)');
  logger.info('NaverWorks_UserInfo_TBL table created with role column');
}

/**
 * userId로 사용자 정보 조회
 */
export async function getUserInfoById(userId: string): Promise<NaverWorksUserInfo | null> {
  const pool = await getConnection();
  const result = await pool
    .request()
    .input('userId', sql.VarChar(100), userId)
    .query<NaverWorksUserInfo>('SELECT * FROM NaverWorks_UserInfo_TBL WHERE userId = @userId');

  return result.recordset[0] || null;
}

export interface NaverWorksUserInfo {
  userId: string;
  email: string;
  fullName: string;
  employmentType: string;
  birthday: string;
  birthType: string;
  orgUnitName: string;
  levelName: string;
  positionName: string;
  role: UserRole;
  syncedAt: Date;
}
