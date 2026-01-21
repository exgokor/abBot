import { Router, Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';
import { setEncryptedValue } from '../services/database/envDB';
import { config } from '../config';

const router = Router();

const TOKEN_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token';

/**
 * OAuth Callback 엔드포인트
 * NaverWorks OAuth 인증 후 리다이렉트되어 authorization code를 받음
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    logger.error(`OAuth error: ${error} - ${error_description}`);
    res.status(400).json({ error, error_description });
    return;
  }

  if (!code) {
    logger.error('No authorization code received');
    res.status(400).json({ error: 'No authorization code' });
    return;
  }

  logger.info(`Received authorization code: ${String(code).substring(0, 20)}...`);
  logger.info(`State: ${state}`);

  try {
    // Authorization code로 토큰 교환
    const response = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.naverWorks.clientId,
        client_secret: config.naverWorks.clientSecret,
        code: String(code),
        redirect_uri: config.naverWorks.redirectUri,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token, refresh_token, token_type, expires_in } = response.data;

    logger.info('Token exchange successful!');
    logger.info(`Token type: ${token_type}, Expires in: ${expires_in}`);

    // DB에 암호화하여 저장
    await setEncryptedValue('ACCESS_TOKEN', access_token);
    await setEncryptedValue('REFRESH_TOKEN', refresh_token);

    logger.info('Tokens saved to database');

    res.json({
      success: true,
      message: 'Token refresh complete',
      token_type,
      expires_in,
    });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      logger.error(`Token exchange failed: ${err.response?.status}`);
      logger.error(`Error: ${JSON.stringify(err.response?.data)}`);
      res.status(500).json({
        error: 'Token exchange failed',
        details: err.response?.data,
      });
    } else {
      logger.error('Token exchange error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;
