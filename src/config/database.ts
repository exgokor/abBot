import { config } from './index';

export const sqlConfig = {
  server: config.database.server,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  options: {
    encrypt: config.database.encrypt,
    trustServerCertificate: true,
  },
  connectionTimeout: 30000,  // 연결 타임아웃 30초 (기본 15초)
  requestTimeout: 30000,     // 쿼리 타임아웃 30초
  pool: {
    max: 10,
    min: 2,  // 최소 2개 연결 유지 (콜드스타트 방지)
    idleTimeoutMillis: 60000,  // 1분 유휴 타임아웃
  },
};
