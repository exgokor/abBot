import sql from 'mssql';
import { sqlConfig } from '../../config/database';
import { logger } from '../../utils/logger';

let pool: sql.ConnectionPool | null = null;

export async function getConnection(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  try {
    pool = await sql.connect(sqlConfig);
    logger.info('MSSQL connection established');
    return pool;
  } catch (error) {
    logger.error('MSSQL connection failed:', error);
    throw error;
  }
}

export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    logger.info('MSSQL connection closed');
  }
}
