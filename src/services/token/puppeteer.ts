import puppeteer from 'puppeteer-core';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { saveToken } from '../naverworks/auth';

const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

export interface PuppeteerTokenResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

export async function refreshTokenViaPuppeteer(): Promise<PuppeteerTokenResult> {
  let browser;

  try {
    logger.info('Starting Puppeteer token refresh...');

    browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });

    const page = await browser.newPage();

    // OAuth 인증 URL 구성
    const authUrl = buildAuthUrl();
    logger.info(`Navigating to auth URL...`);

    await page.goto(authUrl, { waitUntil: 'networkidle2' });

    // 로그인 페이지 대기 및 로그인
    await performLogin(page);

    // 리다이렉트 대기 및 토큰 추출
    const result = await waitForRedirectAndExtractToken(page);

    if (result.success && result.accessToken && result.refreshToken) {
      await saveToken(result.accessToken, result.refreshToken, result.expiresIn || 3600);
      logger.info('Token refreshed via Puppeteer successfully');
    }

    return result;
  } catch (error) {
    logger.error('Puppeteer token refresh failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function buildAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: config.naverWorks.clientId,
    redirect_uri: config.naverWorks.redirectUri,
    response_type: 'code',
    scope: 'bot bot.message',
    state: 'puppeteer-refresh',
  });

  return `https://auth.worksmobile.com/oauth2/v2.0/authorize?${params.toString()}`;
}

async function performLogin(page: puppeteer.Page): Promise<void> {
  // NaverWorks 로그인 폼 대기
  // 실제 로그인 페이지 selector는 NaverWorks 페이지 구조에 따라 조정 필요
  try {
    // ID 입력
    await page.waitForSelector('input[type="text"], input[name="username"], #id', { timeout: 10000 });
    const idInput = await page.$('input[type="text"], input[name="username"], #id');
    if (idInput) {
      await idInput.type(config.naverWorks.loginId);
    }

    // PW 입력
    await page.waitForSelector('input[type="password"], input[name="password"], #pw', { timeout: 5000 });
    const pwInput = await page.$('input[type="password"], input[name="password"], #pw');
    if (pwInput) {
      await pwInput.type(config.naverWorks.loginPw);
    }

    // 로그인 버튼 클릭
    const loginButton = await page.$('button[type="submit"], input[type="submit"], .login-btn');
    if (loginButton) {
      await loginButton.click();
    }

    // 로그인 완료 대기
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    logger.info('Login completed');
  } catch (error) {
    logger.error('Login failed:', error);
    throw new Error('Login failed');
  }
}

async function waitForRedirectAndExtractToken(page: puppeteer.Page): Promise<PuppeteerTokenResult> {
  try {
    // 리다이렉트 URL에서 authorization code 추출
    await page.waitForFunction(
      (redirectUri: string) => window.location.href.startsWith(redirectUri),
      { timeout: 30000 },
      config.naverWorks.redirectUri
    );

    const currentUrl = page.url();
    const urlParams = new URLSearchParams(new URL(currentUrl).search);
    const code = urlParams.get('code');

    if (!code) {
      return { success: false, error: 'Authorization code not found in redirect' };
    }

    // Authorization code로 토큰 교환
    const tokenResult = await exchangeCodeForToken(code);
    return tokenResult;
  } catch (error) {
    logger.error('Failed to extract token from redirect:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract token',
    };
  }
}

async function exchangeCodeForToken(code: string): Promise<PuppeteerTokenResult> {
  const axios = (await import('axios')).default;

  try {
    const response = await axios.post(
      'https://auth.worksmobile.com/oauth2/v2.0/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.naverWorks.clientId,
        client_secret: config.naverWorks.clientSecret,
        code,
        redirect_uri: config.naverWorks.redirectUri,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    return {
      success: true,
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
    };
  } catch (error) {
    logger.error('Token exchange failed:', error);
    return {
      success: false,
      error: 'Token exchange failed',
    };
  }
}
