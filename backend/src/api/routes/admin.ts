import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from '../../database/connection';
import { AppError } from '../../middleware/errorHandler';
import { adminAuth } from '../../middleware/adminAuth';
import { logger } from '../../utils/logger';
import kleosService from '../../services/kleosService';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

let adminPasswordHash: string | null = null;
(async () => {
  const plainPass = process.env.ADMIN_PASSWORD || '';
  if (plainPass) {
    adminPasswordHash = await bcrypt.hash(plainPass, 10);
  }
})();

// Login (public)
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const expectedUsername = process.env.ADMIN_USERNAME || '';

  if (!expectedUsername || !adminPasswordHash) {
    throw new AppError('Admin credentials not configured', 500);
  }

  if (username !== expectedUsername) {
    throw new AppError('Ungültige Anmeldedaten', 401);
  }

  const valid = await bcrypt.compare(password, adminPasswordHash);
  if (!valid) {
    throw new AppError('Ungültige Anmeldedaten', 401);
  }

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
  res.json({ token });
});

// Verify token (public)
router.get('/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.json({ valid: false });
    return;
  }
  try {
    jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    res.json({ valid: true });
  } catch {
    res.json({ valid: false });
  }
});

// All routes below require authentication
router.use(adminAuth);

// Get all inquiries with pagination
router.get('/inquiries', async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = "WHERE i.deleted_at IS NULL";
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND i.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (
        c.first_name ILIKE $${paramIndex} OR
        c.last_name ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex} OR
        i.legal_area ILIKE $${paramIndex} OR
        i.legal_topic ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    params.push(Number(limit), offset);

    const result = await query(
      `SELECT 
        i.id,
        i.status,
        i.legal_area,
        i.legal_topic,
        i.case_worker_id,
        i.channel,
        i.created_at,
        i.updated_at,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        (SELECT COUNT(*) FROM conversations WHERE inquiry_id = i.id) as message_count,
        (SELECT COUNT(*) FROM documents WHERE inquiry_id = i.id) as document_count
      FROM inquiries i
      LEFT JOIN contacts c ON c.inquiry_id = i.id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM inquiries i ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      inquiries: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].total),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching inquiries', error);
    throw new AppError('Failed to fetch inquiries', 500);
  }
});

// Get inquiry details
router.get('/inquiries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const inquiryResult = await query(
      `SELECT * FROM inquiries WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (inquiryResult.rows.length === 0) {
      throw new AppError('Inquiry not found', 404);
    }

    const inquiry = inquiryResult.rows[0];

    // Get contact
    const contactResult = await query(
      `SELECT * FROM contacts WHERE inquiry_id = $1`,
      [id]
    );

    // Get conversations: via session (chatbot) or via inquiry_id (email intake)
    const conversationsResult = await query(
      `SELECT c.* FROM conversations c
       WHERE c.inquiry_id = $1
          OR c.session_id = (SELECT s.id FROM sessions s WHERE s.inquiry_id = $1 LIMIT 1)
       ORDER BY c.created_at ASC`,
      [id]
    );

    // Get documents (by inquiry_id or via session for unlinked docs)
    const documentsResult = await query(
      `SELECT DISTINCT d.* FROM documents d
       LEFT JOIN conversations c ON c.message_type = 'file'
         AND c.metadata->>'fileId' = d.id::text
       LEFT JOIN sessions s ON s.inquiry_id = $1
       WHERE d.inquiry_id = $1
          OR (c.session_id = s.id AND d.inquiry_id IS NULL)
       ORDER BY d.uploaded_at ASC`,
      [id]
    );

    res.json({
      inquiry,
      contact: contactResult.rows[0] || null,
      conversations: conversationsResult.rows,
      documents: documentsResult.rows,
    });
  } catch (error: any) {
    logger.error('Error fetching inquiry details', error);
    throw error;
  }
});

// Update inquiry status
router.patch('/inquiries/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['new', 'in_progress', 'completed', 'rejected'];
    if (!validStatuses.includes(status)) {
      throw new AppError('Invalid status', 400);
    }

    const result = await query(
      `UPDATE inquiries SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Inquiry not found', 404);
    }

    res.json({ inquiry: result.rows[0] });
  } catch (error: any) {
    logger.error('Error updating status', error);
    throw error;
  }
});

// Export to Kleos
router.post('/inquiries/:id/export-kleos', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await kleosService.exportInquiry(id);

    const result = await query(
      `SELECT * FROM inquiries WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      inquiry: result.rows[0],
      message: 'Export to Kleos completed',
    });
  } catch (error: any) {
    logger.error('Error exporting to Kleos', error);
    throw new AppError(error.message || 'Failed to export to Kleos', 500);
  }
});

// Get settings
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const result = await query('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const row of result.rows) settings[row.key] = row.value;
    res.json({ settings });
  } catch (error: any) {
    logger.error('Error fetching settings', error);
    throw new AppError('Failed to fetch settings', 500);
  }
});

// Update a setting
router.patch('/settings', async (req: Request, res: Response) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) throw new AppError('key and value are required', 400);

    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      [key, String(value)]
    );

    res.json({ success: true, key, value: String(value) });
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    logger.error('Error updating setting', error);
    throw new AppError('Failed to update setting', 500);
  }
});

// Get statistics
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const statsResult = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'new') as new_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COUNT(*) FILTER (WHERE channel = 'chatbot') as chatbot_count,
        COUNT(*) FILTER (WHERE channel = 'email') as email_count,
        COUNT(*) as total_count
      FROM inquiries
      WHERE deleted_at IS NULL`
    );

    res.json({ stats: statsResult.rows[0] });
  } catch (error: any) {
    logger.error('Error fetching stats', error);
    throw new AppError('Failed to fetch statistics', 500);
  }
});

export default router;

