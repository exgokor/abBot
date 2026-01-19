import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { getConnection, closeConnection } from './services/database/connection';

const PORT = config.server.port;

async function start(): Promise<void> {
  try {
    // DB 연결 테스트
    await getConnection();
    logger.info('Database connection established');

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
