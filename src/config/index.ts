import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '8080', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  naverWorks: {
    clientId: process.env.NAVER_WORKS_CLIENT_ID || '',
    clientSecret: process.env.NAVER_WORKS_CLIENT_SECRET || '',
    serviceAccount: process.env.NAVER_WORKS_SERVICE_ACCOUNT || '',
    botId: process.env.NAVER_WORKS_BOT_ID || '',
    redirectUri: process.env.NAVER_WORKS_REDIRECT_URI || '',
    loginId: process.env.NAVER_WORKS_LOGIN_ID || '',
    loginPw: process.env.NAVER_WORKS_LOGIN_PW || '',
  },
  database: {
    server: process.env.DB_SERVER || '',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: process.env.DB_DATABASE || '',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    encrypt: process.env.DB_ENCRYPT === 'true',
  },
};
