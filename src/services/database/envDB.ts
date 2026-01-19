import { getConnection } from './connection';
import { logger } from '../../utils/logger';
import { encrypt, decrypt } from '../../utils/crypto';

/**
 * DB에서 암호화된 설정값 조회 및 복호화
 * 테이블: NaverWorks (key, value)
 */
export async function getEncryptedValue(key: string): Promise<string> {
  const pool = await getConnection();

  try {
    const result = await pool.request()
      .input('key', key)
      .query(`SELECT value FROM NaverWorks WHERE [key] = @key`);

    if (result.recordset.length === 0) {
      throw new Error(`Config key "${key}" not found in database`);
    }

    const encryptedValue = result.recordset[0].value;
    return decrypt(encryptedValue);
  } catch (error) {
    logger.error(`Failed to get encrypted value for key: ${key}`, error);
    throw error;
  }
}

/**
 * DB에 암호화하여 설정값 저장
 * 테이블: NaverWorks (key, value)
 */
export async function setEncryptedValue(key: string, value: string): Promise<void> {
  const pool = await getConnection();
  const encryptedValue = encrypt(value);

  try {
    await pool.request()
      .input('key', key)
      .input('value', encryptedValue)
      .query(`
        MERGE NaverWorks AS target
        USING (SELECT @key AS [key]) AS source ON target.[key] = source.[key]
        WHEN MATCHED THEN
          UPDATE SET value = @value
        WHEN NOT MATCHED THEN
          INSERT ([key], value) VALUES (@key, @value);
      `);

    logger.debug(`Encrypted value updated for key: ${key}`);
  } catch (error) {
    logger.error(`Failed to set encrypted value for key: ${key}`, error);
    throw error;
  }
}
