import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '8080', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  naverWorks: {
    botId: process.env.NAVER_WORKS_BOT_ID || '',
    domainId: process.env.NAVER_WORKS_DOMAIN_ID || '',
    clientId: process.env.NAVER_WORKS_CLIENT_ID || '',
    clientSecret: process.env.NAVER_WORKS_CLIENT_SECRET || '',
    adminId: process.env.NAVER_WORKS_ADMIN_ID || '',
    adminPw: process.env.NAVER_WORKS_ADMIN_PW || '',
    authUrl: 'https://auth.worksmobile.com/oauth2/v2.0/authorize?response_type=code&scope=bot',
    redirectUri: process.env.NAVER_WORKS_REDIRECT_URI || '',
    notifyUserId: process.env.NAVER_WORKS_NOTIFY_USER_ID || '',
  },
  database: {
    server: process.env.DB_SERVER || '',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: process.env.DB_DATABASE || '',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    encrypt: process.env.DB_ENCRYPT === 'true',
  },
  secretKey: process.env.SECRET_KEY || '',
};
