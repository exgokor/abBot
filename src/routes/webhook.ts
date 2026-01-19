import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { handleBotRequest, BotRequest } from '../handlers';

const router = Router();

/**
 * NaverWorks Bot Webhook
 * POST /webhook
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const request: BotRequest = req.body;

    logger.info(`Webhook received: ${request.type}`);
    logger.debug(`Body: ${JSON.stringify(request)}`);

    // 빠른 응답 (NaverWorks는 빠른 200 응답 필요)
    res.status(200).json({ success: true });

    // 메시지 처리 (비동기)
    handleBotRequest(request).catch((error) => {
      logger.error('Error processing webhook:', error);
    });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
