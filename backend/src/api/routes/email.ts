import express, { Request, Response } from 'express';
import emailParserService from '../../services/emailParserService';
import { logger } from '../../utils/logger';

const router = express.Router();

// Email parser status
router.get('/status', async (_req: Request, res: Response) => {
  res.json({
    status: 'active',
    lastCheck: new Date().toISOString(),
  });
});

// Manual email processing trigger
router.post('/process', async (_req: Request, res: Response) => {
  try {
    await emailParserService.checkEmails();
    res.json({
      success: true,
      message: 'Email processing completed',
    });
  } catch (error: any) {
    logger.error('Manual email processing failed', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Email processing failed',
    });
  }
});

export default router;

