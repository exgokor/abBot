import { Router } from 'express';
import healthRouter from './health';
import webhookRouter from './webhook';
import callbackRouter from './callback';

const router = Router();

router.use(healthRouter);
router.use(webhookRouter);
router.use(callbackRouter);

export default router;
