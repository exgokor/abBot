import { Router } from 'express';
import healthRouter from './health';
import webhookRouter from './webhook';

const router = Router();

router.use(healthRouter);
router.use(webhookRouter);

export default router;
