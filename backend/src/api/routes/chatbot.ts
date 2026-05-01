import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import chatbotFlowService from '../../services/chatbotFlow';
import sessionService from '../../services/sessionService';
import { query } from '../../database/connection';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

const router = express.Router();

// Public: check if chatbot intake is enabled (no auth)
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const result = await query("SELECT value FROM settings WHERE key = 'chatbot_enabled'");
    const enabled = result.rows.length > 0 ? result.rows[0].value === 'true' : true;
    res.json({ enabled });
  } catch {
    res.json({ enabled: true });
  }
});

// Configure multer for file uploads
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024),
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'pdf,doc,docx,jpg,jpeg,png').split(',');
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new AppError(`File type .${ext} not allowed`, 400));
    }
  },
});

// Create new session
router.post('/session', async (_req: Request, res: Response) => {
  try {
    const sessionId = await sessionService.createSession();
    const startStep = chatbotFlowService.getStartStep();
    
    await sessionService.saveMessage(sessionId, startStep.message, 'bot', 'choice');
    await sessionService.updateSession(sessionId, {
      currentStep: 'start',
      flowPath: ['start'],
      collectedData: {},
    });

    res.json({
      sessionId,
      step: startStep,
    });
  } catch (error: any) {
    logger.error('Error creating session', error);
    throw new AppError('Failed to create session', 500);
  }
});

// Get session data
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const sessionData = await sessionService.getSessionData(sessionId);
    
    if (!sessionData) {
      throw new AppError('Session not found', 404);
    }

    const step = chatbotFlowService.getStep(sessionData.currentStep);
    const history = await sessionService.getConversationHistory(sessionId);

    res.json({
      sessionId,
      currentStep: sessionData.currentStep,
      step,
      history,
      collectedData: sessionData.collectedData,
    });
  } catch (error: any) {
    logger.error('Error getting session', error);
    throw error;
  }
});

// Handle chatbot message
router.post('/message', async (req: Request, res: Response) => {
  try {
    const { sessionId, message, choiceIndex } = req.body;

    if (!sessionId) {
      throw new AppError('Session ID required', 400);
    }

    let sessionData = await sessionService.getSessionData(sessionId);
    if (!sessionData) {
      // Create new session if doesn't exist
      const newSessionId = await sessionService.createSession();
      sessionData = await sessionService.getSessionData(newSessionId);
      if (!sessionData) {
        throw new AppError('Failed to create session', 500);
      }
    }

    const currentStep = chatbotFlowService.getStep(sessionData.currentStep);
    if (!currentStep) {
      throw new AppError('Invalid step', 400);
    }

    // Save user message
    if (message) {
      await sessionService.saveMessage(sessionId, message, 'user', 'text');
    }

    // Determine next step
    let nextStepId: string | null = null;
    if (currentStep.type === 'choice' && choiceIndex !== undefined) {
      nextStepId = chatbotFlowService.getNextStep(sessionData.currentStep, choiceIndex);
    } else if (currentStep.next) {
      nextStepId = currentStep.next;
    }

    // Store collected data
    const collectedData = { ...sessionData.collectedData };
    if (message && currentStep.type === 'input') {
      collectedData[sessionData.currentStep] = message;
    }

    // Update flow path
    const flowPath = [...sessionData.flowPath];
    if (nextStepId) {
      flowPath.push(nextStepId);
    }

    // Get next step
    let nextStep = null;
    let inquiryId: string | null = null;
    
    if (nextStepId) {
      nextStep = chatbotFlowService.getStep(nextStepId);
    }

    // Handle end of flow - create inquiry
    if (nextStep?.type === 'end' || nextStep?.type === 'contact') {
      const legalInfo = chatbotFlowService.determineLegalArea(flowPath);
      const inquiryResult = await query(
        `INSERT INTO inquiries (status, legal_area, legal_topic, channel, case_worker_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['new', legalInfo.area, legalInfo.topic, 'chatbot', parseInt(process.env.KLEOS_RESPONSIBLE_LAWYER_ID || '374')]
      );
      inquiryId = inquiryResult.rows[0].id;

      // Save conversation and documents to inquiry
      await query(
        `UPDATE conversations SET inquiry_id = $1 WHERE session_id = $2`,
        [inquiryId, sessionId]
      );

      // Link any documents uploaded during this session
      await query(
        `UPDATE documents SET inquiry_id = $1 WHERE inquiry_id IS NULL AND id IN (
          SELECT (metadata->>'fileId')::uuid FROM conversations
          WHERE session_id = $2 AND message_type = 'file' AND metadata->>'fileId' IS NOT NULL
        )`,
        [inquiryId, sessionId]
      );
    }

    // Save bot response
    if (nextStep) {
      await sessionService.saveMessage(
        sessionId,
        nextStep.message,
        'bot',
        nextStep.type,
        { step: nextStepId, options: nextStep.options }
      );
    }

    // Update session AFTER saving messages so getSessionData returns correct metadata
    if (nextStepId) {
      await sessionService.updateSession(sessionId, {
        currentStep: nextStepId,
        flowPath,
        collectedData,
        ...(inquiryId && { inquiryId: inquiryId.toString() }),
      });
    }

    res.json({
      sessionId,
      step: nextStep,
      collectedData,
    });
  } catch (error: any) {
    logger.error('Error handling message', error);
    throw error;
  }
});

// Handle file upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId || !req.file) {
      throw new AppError('Session ID and file required', 400);
    }

    const sessionData = await sessionService.getSessionData(sessionId);
    if (!sessionData) {
      throw new AppError('Session not found', 404);
    }

    // Save file info
    const fileResult = await query(
      `INSERT INTO documents (inquiry_id, filename, original_filename, filepath, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        sessionData.inquiryId || null,
        req.file.filename,
        req.file.originalname,
        req.file.path,
        req.file.size,
        req.file.mimetype,
      ]
    );

    await sessionService.saveMessage(
      sessionId,
      `Datei hochgeladen: ${req.file.originalname}`,
      'user',
      'file',
      { fileId: fileResult.rows[0].id, filename: req.file.originalname }
    );

    res.json({
      success: true,
      fileId: fileResult.rows[0].id,
      filename: req.file.originalname,
    });
  } catch (error: any) {
    logger.error('Error uploading file', error);
    throw error;
  }
});

// Submit contact form
router.post('/contact', async (req: Request, res: Response) => {
  try {
    const { sessionId, name, email, phone, street, houseNumber, zipCode, town } = req.body;

    if (!sessionId || !name || !email || !phone) {
      throw new AppError('Session ID, name, email, and phone are required', 400);
    }

    const sessionData = await sessionService.getSessionData(sessionId);
    if (!sessionData || !sessionData.inquiryId) {
      throw new AppError('Session or inquiry not found', 404);
    }

    // Parse name
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Save contact
    await query(
      `INSERT INTO contacts (inquiry_id, first_name, last_name, email, phone, street, house_number, zip_code, town)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [sessionData.inquiryId, firstName, lastName, email, phone, street || null, houseNumber || null, zipCode || null, town || null]
    );

    // Get GDPR consent step
    const consentStep = chatbotFlowService.getStep('gdpr_consent');
    const endStep = chatbotFlowService.getStep('end');

    await sessionService.saveMessage(
      sessionId,
      `Kontaktdaten: ${name}, ${email}, ${phone}`,
      'user',
      'contact'
    );

    if (consentStep) {
      await sessionService.saveMessage(sessionId, consentStep.message, 'bot', 'consent');
    }

    await sessionService.updateSession(sessionId, {
      currentStep: 'gdpr_consent',
      flowPath: [...sessionData.flowPath, 'gdpr_consent'],
    });

    res.json({
      success: true,
      step: consentStep,
      nextStep: endStep,
    });
  } catch (error: any) {
    logger.error('Error submitting contact', error);
    throw error;
  }
});

// Submit GDPR consent
router.post('/consent', async (req: Request, res: Response) => {
  try {
    const { sessionId, consented } = req.body;

    if (!sessionId) {
      throw new AppError('Session ID required', 400);
    }

    const sessionData = await sessionService.getSessionData(sessionId);
    if (!sessionData) {
      throw new AppError('Session not found', 404);
    }

    const endStep = chatbotFlowService.getStep('end');

    await sessionService.saveMessage(
      sessionId,
      consented ? 'Einverständnis erteilt' : 'Einverständnis verweigert',
      'user',
      'consent'
    );

    if (endStep) {
      await sessionService.saveMessage(sessionId, endStep.message, 'bot', 'end');
    }

    await sessionService.updateSession(sessionId, {
      currentStep: 'end',
      flowPath: [...sessionData.flowPath, 'end'],
      collectedData: {
        ...sessionData.collectedData,
        gdprConsent: consented,
        gdprConsentDate: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      step: endStep,
    });
  } catch (error: any) {
    logger.error('Error submitting consent', error);
    throw error;
  }
});

export default router;

