import sql from 'mssql';
import { getConnection } from './connection';
import { logger } from '../../utils/logger';

export async function executeQuery<T>(query: string, params?: Record<string, unknown>): Promise<T[]> {
  const pool = await getConnection();
  const request = pool.request();

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }

  try {
    const result = await request.query(query);
    return result.recordset as T[];
  } catch (error) {
    logger.error(`Query execution failed: ${query}`, error);
    throw error;
  }
}

export async function executeStoredProcedure<T>(
  procedureName: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const pool = await getConnection();
  const request = pool.request();

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }

  try {
    const result = await request.execute(procedureName);
    return result.recordset as T[];
  } catch (error) {
    logger.error(`Stored procedure execution failed: ${procedureName}`, error);
    throw error;
  }
}
