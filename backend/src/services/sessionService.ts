import { v4 as uuidv4 } from 'uuid';
import { query } from '../database/connection';

export interface SessionData {
  sessionId: string;
  currentStep: string;
  flowPath: string[];
  collectedData: { [key: string]: any };
  inquiryId?: string;
  createdAt: Date;
  updatedAt: Date;
}

class SessionService {
  async createSession(): Promise<string> {
    const sessionId = uuidv4();

    await query(
      `INSERT INTO sessions (id, current_step, flow_path, collected_data)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, 'start', JSON.stringify([]), JSON.stringify({})]
    );

    await query(
      `INSERT INTO conversations (session_id, message, sender, message_type)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, 'Session started', 'system', 'system']
    );

    return sessionId;
  }

  async getSessionData(sessionId: string): Promise<SessionData | null> {
    const result = await query(
      `SELECT id, current_step, flow_path, collected_data, inquiry_id, created_at, updated_at
       FROM sessions
       WHERE id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    return {
      sessionId: row.id,
      currentStep: row.current_step,
      flowPath: row.flow_path || [],
      collectedData: row.collected_data || {},
      inquiryId: row.inquiry_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateSession(sessionId: string, data: Partial<SessionData>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.currentStep !== undefined) {
      sets.push(`current_step = $${idx++}`);
      values.push(data.currentStep);
    }
    if (data.flowPath !== undefined) {
      sets.push(`flow_path = $${idx++}`);
      values.push(JSON.stringify(data.flowPath));
    }
    if (data.collectedData !== undefined) {
      sets.push(`collected_data = $${idx++}`);
      values.push(JSON.stringify(data.collectedData));
    }
    if (data.inquiryId !== undefined) {
      sets.push(`inquiry_id = $${idx++}`);
      values.push(data.inquiryId);
    }

    sets.push(`updated_at = $${idx++}`);
    values.push(new Date());
    values.push(sessionId);

    if (sets.length > 0) {
      await query(
        `UPDATE sessions SET ${sets.join(', ')} WHERE id = $${idx}`,
        values
      );
    }
  }

  async saveMessage(
    sessionId: string,
    message: string,
    sender: 'user' | 'bot',
    messageType: string = 'text',
    metadata?: any
  ): Promise<void> {
    await query(
      `INSERT INTO conversations (session_id, message, sender, message_type, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, message, sender, messageType, metadata ? JSON.stringify(metadata) : null]
    );
  }

  async getConversationHistory(sessionId: string): Promise<any[]> {
    const result = await query(
      `SELECT message, sender, message_type, metadata, created_at
       FROM conversations
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    return result.rows;
  }
}

export default new SessionService();
