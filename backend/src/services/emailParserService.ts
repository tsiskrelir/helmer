// @ts-ignore - No type definitions available
import Imap from 'imap';
// @ts-ignore - No type definitions available
import { simpleParser } from 'mailparser';
import PDFDocument from 'pdfkit';
import { logger } from '../utils/logger';
import { query } from '../database/connection';
import OpenAI from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';

function sanitizeFilename(raw: string, defaultExt = '.pdf'): string {
  if (!raw || typeof raw !== 'string') return `dokument${defaultExt}`;
  const ext = (raw.match(/\.[a-z0-9]+$/i) || [defaultExt])[0].toLowerCase();
  let base = raw.replace(/\.[a-z0-9]+$/i, '');
  base = base
    .replace(/ä/g, 'ae').replace(/Ä/g, 'ae')
    .replace(/ö/g, 'oe').replace(/Ö/g, 'oe')
    .replace(/ü/g, 'ue').replace(/Ü/g, 'ue')
    .replace(/ß/g, 'ss');
  base = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 200);
  if (!base) return `dokument${ext}`;
  return `${base}${ext}`;
}

class EmailParserService {
  private imap: Imap | null = null;
  private openai: OpenAI | null = null;
  private isRunning: boolean = false;

  constructor() {
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 300.0, // 5 minutes timeout
        maxRetries: 3, // Retry up to 3 times on failure
      });
    }
  }

  private connectImap(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap = new Imap({
        user: process.env.IMAP_USERNAME || '',
        password: process.env.IMAP_PASSWORD || '',
        host: process.env.IMAP_HOST || '',
        port: parseInt(process.env.IMAP_PORT || '993'),
        tls: process.env.IMAP_SECURE === 'true',
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 30000,
        authTimeout: 15000,
      });

      this.imap.once('ready', () => {
        logger.info('IMAP connection established');
        resolve();
      });

      this.imap.once('error', (err: Error) => {
        logger.error('IMAP connection error', err);
        this.imap = null; // force reconnect on next poll
        reject(err);
      });

      // Also null out on close so a silent drop triggers reconnect too
      this.imap.once('close', () => {
        logger.warn('IMAP connection closed');
        this.imap = null;
      });

      this.imap.connect();
    });
  }

  private async parseEmailWithAI(emailContent: string): Promise<any> {
    if (!this.openai) {
      logger.warn('OpenAI not configured, skipping AI parsing');
      return null;
    }

    const maxRetries = 3;
    const retryDelay = 2; // seconds

    const prompt = `Analyze this German legal inquiry email and extract the following information in JSON format:
{
  "legal_area": "Arbeitsrecht, Mietrecht, or Sonstiges",
  "legal_topic": "specific topic",
  "contact_name": "full name",
  "contact_email": "email if mentioned",
  "contact_phone": "phone if mentioned",
  "description": "brief case description",
  "urgency": "high, medium, or low"
}

Email content:
${emailContent}

Return only valid JSON, no additional text.`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-5',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: emailContent }
          ],
        }, {
          timeout: 300000, // 5 minutes in milliseconds
        });

        const content = response.choices[0]?.message?.content?.trim();
        if (content) {
          try {
            return JSON.parse(content);
          } catch (parseError) {
            logger.error('Error parsing JSON response from GPT-5', parseError);
            // Try to extract JSON from the response if it's wrapped in text
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              return JSON.parse(jsonMatch[0]);
            }
            throw new Error('Invalid JSON response from GPT-5');
          }
        }
      } catch (error: any) {
        // Check if it's a retryable error
        if (error.code === 'timeout' || error.code === 'network_error' || error.status === 429) {
          if (attempt < maxRetries - 1) {
            const waitTime = retryDelay * Math.pow(2, attempt); // Exponential backoff: 2s, 4s, 8s
            logger.warn(`Retrying GPT-5 request (${attempt + 1}/${maxRetries}) in ${waitTime}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            continue;
          }
        }
        logger.error('Error parsing email with AI', error);
        break;
      }
    }

    return null;
  }

  private async generateEmailPdf(opts: {
    subject: string;
    from: string;
    date: Date | undefined;
    bodyText: string;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(9).fillColor('#666666');
      doc.text(`Von: ${opts.from}`, { lineGap: 2 });
      if (opts.date) {
        doc.text(`Datum: ${opts.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, { lineGap: 2 });
      }
      doc.text(`Betreff: ${opts.subject}`, { lineGap: 2 });

      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown();

      // Body
      doc.fontSize(11).fillColor('#000000');
      doc.text(opts.bodyText, { lineGap: 3 });

      doc.end();
    });
  }

  private async processEmail(email: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const imap = this.imap!;
      const fetch = imap.fetch(email, { bodies: '' });

      fetch.on('message', (msg: any) => {
        let emailBuffer = Buffer.alloc(0);

        msg.on('body', (stream: any) => {
          stream.on('data', (chunk: Buffer) => {
            emailBuffer = Buffer.concat([emailBuffer, chunk]);
          });
        });

        msg.once('end', async () => {
          try {
            const parsed = await simpleParser(emailBuffer);
            
            const parsedData = await this.parseEmailWithAI(
              parsed.text || parsed.html || ''
            );

            // Check if email already processed
            const existingResult = await query(
              `SELECT id FROM email_intakes WHERE email_id = $1`,
              [parsed.messageId || parsed.date?.getTime().toString()]
            );

            if (existingResult.rows.length > 0) {
              logger.info('Email already processed', { emailId: parsed.messageId });
              resolve();
              return;
            }

            // Determine legal area
            const legalArea = parsedData?.legal_area || 'Sonstiges';
            const legalTopic = parsedData?.legal_topic || 'Allgemein';

            // Create inquiry
            const inquiryResult = await query(
              `INSERT INTO inquiries (status, legal_area, legal_topic, channel, case_worker_id)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id`,
              [
                'new',
                legalArea,
                legalTopic,
                'email',
                parseInt(process.env.KLEOS_RESPONSIBLE_LAWYER_ID || '374'),
              ]
            );

            const inquiryId = inquiryResult.rows[0].id;

            // Create contact if available
            if (parsedData?.contact_name || parsed.from?.text) {
              const nameParts = (parsedData?.contact_name || parsed.from?.text || '').split(' ');
              await query(
                `INSERT INTO contacts (inquiry_id, first_name, last_name, email, phone)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                  inquiryId,
                  nameParts[0] || '',
                  nameParts.slice(1).join(' ') || '',
                  parsedData?.contact_email || parsed.from?.value[0]?.address || '',
                  parsedData?.contact_phone || null,
                ]
              );
            }

            // Save email intake
            await query(
              `INSERT INTO email_intakes (inquiry_id, email_id, from_email, from_name, subject, body_text, body_html, parsed_data)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                inquiryId,
                parsed.messageId || parsed.date?.getTime().toString(),
                parsed.from?.value[0]?.address || '',
                parsed.from?.text || '',
                parsed.subject || '',
                parsed.text || '',
                parsed.html || '',
                parsedData ? JSON.stringify(parsedData) : null,
              ]
            );

            // Build plain-text body for conversation and PDF
            let bodyText = parsed.text?.trim() || '';
            if (!bodyText && parsed.html) {
              let html = String(parsed.html);
              html = html.replace(/<br\s*\/?>/gi, '\n');
              html = html.replace(/<\/p>/gi, '\n').replace(/<p[^>]*>/gi, '\n');
              html = html.replace(/<\/div>/gi, '\n').replace(/<div[^>]*>/gi, '\n');
              html = html.replace(/<[^>]+>/g, ' ');
              html = html.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
              bodyText = html;
            }
            const conversationMsg = bodyText || parsed.subject || 'E-Mail erhalten';
            await query(
              `INSERT INTO conversations (inquiry_id, message, sender, message_type)
               VALUES ($1, $2, $3, $4)`,
              [inquiryId, conversationMsg, 'user', 'email']
            );

            // Convert email body to PDF and save as a document
            const uploadDir = process.env.UPLOAD_DIR || './uploads';
            await fs.mkdir(uploadDir, { recursive: true });

            if (bodyText) {
              try {
                const pdfBuffer = await this.generateEmailPdf({
                  subject: parsed.subject || 'Kein Betreff',
                  from: parsed.from?.text || 'Unbekannt',
                  date: parsed.date,
                  bodyText,
                });

                let pdfBaseName = parsed.subject || '';
                if (!pdfBaseName.trim()) {
                  const sender = parsed.from?.text || parsed.from?.value?.[0]?.address || 'unbekannt';
                  const dateStr = parsed.date
                    ? parsed.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '_')
                    : new Date().toISOString().slice(0, 10).replace(/-/g, '_');
                  pdfBaseName = `email_von_${sender}_${dateStr}`;
                }
                const pdfOriginalName = sanitizeFilename(pdfBaseName + '.pdf');
                const pdfFilename = `${Date.now()}-email-body.pdf`;
                const pdfFilepath = path.join(uploadDir, pdfFilename);

                await fs.writeFile(pdfFilepath, pdfBuffer);

                await query(
                  `INSERT INTO documents (inquiry_id, filename, original_filename, filepath, file_size, mime_type)
                   VALUES ($1, $2, $3, $4, $5, $6)`,
                  [inquiryId, pdfFilename, pdfOriginalName, pdfFilepath, pdfBuffer.length, 'application/pdf']
                );
                logger.info('Email body converted to PDF', { inquiryId, pdfOriginalName, size: pdfBuffer.length });
              } catch (pdfErr: any) {
                logger.error('Failed to generate email body PDF', { inquiryId, message: pdfErr.message });
              }
            }

            // Process attachments
            if (parsed.attachments && parsed.attachments.length > 0) {
              for (const attachment of parsed.attachments) {
                const attExt = path.extname(attachment.filename || '') || '.bin';
                const safeName = sanitizeFilename(attachment.filename || 'anhang', attExt);
                const diskFilename = `${Date.now()}-${safeName}`;
                const filepath = path.join(uploadDir, diskFilename);

                await fs.writeFile(filepath, attachment.content);

                await query(
                  `INSERT INTO documents (inquiry_id, filename, original_filename, filepath, file_size, mime_type)
                   VALUES ($1, $2, $3, $4, $5, $6)`,
                  [
                    inquiryId,
                    diskFilename,
                    safeName,
                    filepath,
                    attachment.content.length,
                    attachment.contentType || 'application/octet-stream',
                  ]
                );
              }
            }

            logger.info('Email processed and inquiry created', { inquiryId });
            resolve();
          } catch (error: any) {
            logger.error('Error processing email', error);
            reject(error);
          }
        });
      });

      fetch.once('error', (err: Error) => {
        logger.error('Error fetching email', err);
        reject(err);
      });
    });
  }

  async checkEmails(): Promise<void> {
    if (this.isRunning) {
      logger.info('Email check already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      if (!this.imap) {
        await this.connectImap();
      }

      // Use await (not return) so the try/catch here can catch synchronous
      // throws from the imap library (e.g. "Not authenticated" on a dead socket)
      await new Promise<void>((resolve, reject) => {
        const imap = this.imap!;

        imap.openBox('INBOX', false, (err: any, _box: any) => {
          if (err) {
            logger.error('Error opening inbox', err);
            reject(err);
            return;
          }

          // Search for unread emails
          imap.search(['UNSEEN'], async (err: any, results: any) => {
            if (err) {
              logger.error('Error searching emails', err);
              reject(err);
              return;
            }

            if (!results || results.length === 0) {
              logger.info('No new emails found');
              resolve();
              return;
            }

            logger.info(`Found ${results.length} new emails`);

            // Process emails
            for (const emailId of results) {
              try {
                await this.processEmail(emailId);

                // Mark as read
                imap.addFlags(emailId, '\\Seen', (err: any) => {
                  if (err) logger.error('Error marking email as read', err);
                });
              } catch (error: any) {
                logger.error(`Error processing email ${emailId}`, error);
                // Continue with next email
              }
            }

            resolve();
          });
        });
      });
    } catch (error: any) {
      logger.error('Error in email check', error);
      // Null out a potentially broken connection so the next poll reconnects
      this.imap = null;
      throw error;
    } finally {
      // Always release the lock, even if an unexpected throw escapes
      this.isRunning = false;
    }
  }

  startPolling(): void {
    const intervalMinutes = parseFloat(process.env.IMAP_POLL_INTERVAL_MINUTES || '0.5');
    const intervalMs = Math.max(15000, Math.round(intervalMinutes * 60 * 1000));

    logger.info(`Starting email polling every ${intervalMs / 1000} seconds`);

    // Initial check
    this.checkEmails().catch((err) => {
      logger.error('Initial email check failed', err);
    });

    // Set up interval
    setInterval(() => {
      this.checkEmails().catch((err) => {
        logger.error('Scheduled email check failed', err);
      });
    }, intervalMs);
  }
}

export default new EmailParserService();

