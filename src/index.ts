import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { getConnection, closeConnection } from './services/database/connection';

const PORT = config.server.port;

async function start(): Promise<void> {
  try {
    // DB 연결 + 풀 워밍업 (8개 연결 미리 생성)
    const tWarmup = Date.now();
    const pool = await getConnection();
    await Promise.all(
      Array.from({ length: 8 }, () => pool.request().query('SELECT 1'))
    );
    logger.info(`[PERF] DB 풀 워밍업 완료: ${Date.now() - tWarmup}ms (8 connections)`);

    // 서버 시작
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${config.server.nodeEnv}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await closeConnection();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await closeConnection();
  process.exit(0);
});

start();
