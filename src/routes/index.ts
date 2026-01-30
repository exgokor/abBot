import { Router } from 'express';
import healthRouter from './health';
import webhookRouter from './webhook';
import callbackRouter from './callback';
import blocksRouter from './blocks';

const router = Router();

router.use(healthRouter);
router.use(webhookRouter);
router.use(callbackRouter);
router.use(blocksRouter);

export default router;
