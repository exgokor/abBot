import { Router } from 'express';
import { handleMessage } from '../controllers/botController';

const router = Router();

router.post('/webhook', handleMessage);

export default router;
