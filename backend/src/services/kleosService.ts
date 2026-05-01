import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { logger } from '../utils/logger';
import { query } from '../database/connection';
import chatbotFlowService from './chatbotFlow';

interface KleosTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface KleosIdentityDto {
  type: string;
  firstName: string;
  lastName: string;
  gender: string;
  languageId: number;
  email: string | null;
  phoneNumber: string | null;
  mainAddress: {
    street: string | null;
    houseNumber: string | null;
    zipCode: string | null;
    countryCode: string;
    town: string | null;
  };
}

interface KleosCaseDto {
  name: string;
  reference: string;
  description: string;
  typeId: number;
  caseResponsibleId: number;
  creationDate: string;
  externalParties?: Array<{
    typeCode: string;
    identityId: number;
  }>;
}

class KleosService {
  private apiBaseUrl: string;
  private tokenUrl: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.apiBaseUrl = process.env.KLEOS_API_BASE_URL || '';
    // Kleos uses a separate identity server for OAuth tokens
    this.tokenUrl = process.env.KLEOS_TOKEN_URL || 'https://ids.kleosapp.com/KLEOSIDENTITYv4/connect/token';
    this.clientId = process.env.KLEOS_CLIENT_ID || '';
    this.clientSecret = process.env.KLEOS_CLIENT_SECRET || '';

    this.axiosInstance = axios.create({
      baseURL: this.apiBaseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private async getAccessToken(): Promise<string> {
    // Check if token is still valid
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    try {
      // Create form data for OAuth2 client_credentials flow
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('scope', 'kleosStateful kleosLegal kleosLegalApiClient');

      logger.info('Requesting Kleos access token', { tokenUrl: this.tokenUrl, clientId: this.clientId });

      const response = await axios.post<KleosTokenResponse>(this.tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.accessToken = response.data.access_token;
      // Set expiration time (subtract 60 seconds for safety)
      this.tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;

      logger.info('Kleos access token obtained successfully');
      return this.accessToken;
    } catch (error: any) {
      logger.error('Error getting Kleos access token', {
        tokenUrl: this.tokenUrl,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw new Error('Failed to authenticate with Kleos API');
    }
  }

  async createIdentity(contactData: any): Promise<string> {
    try {
      const token = await this.getAccessToken();

      // Kleos requires non-empty firstName and lastName - use fallback if missing
      const firstName = (contactData.first_name || '').trim() || 'Unbekannt';
      const lastName = (contactData.last_name || '').trim() || 'Unbekannt';

      const identity: KleosIdentityDto = {
        type: 'N',
        firstName,
        lastName,
        gender: 'U',
        languageId: 36,
        email: contactData.email || null,
        phoneNumber: contactData.phone || null,
        mainAddress: {
          street: contactData.street || null,
          houseNumber: contactData.house_number || null,
          zipCode: contactData.zip_code || null,
          countryCode: 'DE',
          town: contactData.town || null,
        },
      };

      const response = await this.axiosInstance.put('/api/contacts', identity, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const kleosContactId = response.data.result;
      logger.info('Kleos contact created', { contactId: kleosContactId });
      return String(kleosContactId);
    } catch (error: any) {
      const status = error.response?.status;
      const kleosError = error.response?.data;
      const msg = kleosError ? (typeof kleosError === 'object' ? JSON.stringify(kleosError) : String(kleosError)) : error.message;
      logger.error('Error creating Kleos contact', { status, kleosError, message: error.message });
      throw new Error(`Kleos API (${status || 'network'}): ${msg}`);
    }
  }

  private async getNextKleosCaseNumber(): Promise<number> {
    const defaultLast = parseInt(process.env.KLEOS_LAST_CASE_NUMBER || '516');
    await query(
      `INSERT INTO settings (key, value) VALUES ('last_kleos_case_number', $1) ON CONFLICT (key) DO NOTHING`,
      [String(defaultLast)]
    );
    const result = await query(
      `UPDATE settings SET value = (COALESCE(CAST(value AS integer), $1) + 1)::text
       WHERE key = 'last_kleos_case_number' RETURNING value`,
      [defaultLast]
    );
    const next = result.rows[0] ? parseInt(result.rows[0].value, 10) : defaultLast + 1;
    return next;
  }

  async createCase(inquiryData: any, identityId: string): Promise<string> {
    try {
      const token = await this.getAccessToken();

      const legalArea = inquiryData.legal_area || 'Sonstiges';
      const caseTypeId = chatbotFlowService.getCaseTypeId(legalArea);
      const responsibleLawyerId = parseInt(process.env.KLEOS_RESPONSIBLE_LAWYER_ID || '374');

      // Kleos format: 00517-26, 00518-26 (sequential number + year). Helmer's last was 00516-26.
      const year = new Date().getFullYear().toString().slice(-2);
      const seq = await this.getNextKleosCaseNumber();
      const reference = `${String(seq).padStart(5, '0')}-${year}`;

      const caseData: KleosCaseDto = {
        name: `${legalArea} - ${inquiryData.legal_topic || 'Allgemein'}`,
        description: inquiryData.description || `Anfrage: ${legalArea} - ${inquiryData.legal_topic || 'Allgemein'}`,
        reference,
        typeId: caseTypeId,
        caseResponsibleId: responsibleLawyerId,
        creationDate: new Date().toISOString(),
        externalParties: [{
          typeCode: 'MA',
          identityId: parseInt(identityId),
        }],
      };

      logger.info('Creating Kleos case', {
        caseName: caseData.name,
        reference: caseData.reference,
        descriptionLength: caseData.description.length,
        descriptionPreview: caseData.description.slice(0, 300),
        typeId: caseData.typeId,
      });

      const response = await this.axiosInstance.put('/api/cases', caseData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const kleosCaseId = response.data.result;
      logger.info('Kleos case created', { caseId: kleosCaseId, reference: caseData.reference });
      return String(kleosCaseId);
    } catch (error: any) {
      const status = error.response?.status;
      const kleosError = error.response?.data;
      const msg = kleosError ? (typeof kleosError === 'object' ? JSON.stringify(kleosError) : String(kleosError)) : error.message;
      logger.error('Error creating Kleos case', { status, kleosError, message: error.message });
      throw new Error(`Kleos API (${status || 'network'}): ${msg}`);
    }
  }

  private async getDocumentFolderId(caseId: string, token: string): Promise<number> {
    const configured = parseInt(process.env.KLEOS_DOCUMENT_FOLDER_ALL || '3');
    try {
      const response = await this.axiosInstance.get(`/api/documentfolders/${caseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const folders: any[] = response.data?.result || [];
      // Use configured folder if it exists in the list, otherwise use the first root folder
      const found = folders.find((f: any) => f.id === configured);
      const folderId = found ? found.id : (folders[0]?.id ?? configured);
      logger.info('Document folder resolved', { caseId, folderId });
      return folderId;
    } catch {
      logger.warn('Could not fetch document folders, using configured default', { caseId, configured });
      return configured;
    }
  }

  /** Sanitize filename for Kleos: lowercase, underscores, no symbols, German umlauts transliterated. */
  private sanitizeFilename(raw: string, defaultExt = '.pdf'): string {
    if (!raw || typeof raw !== 'string') return `dokument${defaultExt}`;

    const ext = (raw.match(/\.[a-z0-9]+$/i) || [defaultExt])[0].toLowerCase();
    let base = raw.replace(/\.[a-z0-9]+$/i, '');

    // Transliterate German umlauts and ß
    base = base
      .replace(/ä/g, 'ae').replace(/Ä/g, 'ae')
      .replace(/ö/g, 'oe').replace(/Ö/g, 'oe')
      .replace(/ü/g, 'ue').replace(/Ü/g, 'ue')
      .replace(/ß/g, 'ss');

    // Lowercase, replace any non-alphanumeric with underscore, collapse & trim
    base = base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 200);

    if (!base) return `dokument${ext}`;
    return `${base}${ext}`;
  }

  async uploadDocument(caseId: string, filePath: string, filename: string): Promise<string> {
    const fs = require('fs');
    const pathModule = require('path');
    const os = require('os');

    const ext = pathModule.extname(filename) || '.pdf';
    const safeName = this.sanitizeFilename(filename, ext);

    // Kleos uses the physical file's name, not the JSON `name` field.
    // Copy the file to a temp path with the correct name so the
    // multipart Content-Disposition carries the right filename.
    const tmpDir = pathModule.join(os.tmpdir(), 'kleos-upload');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFilePath = pathModule.join(tmpDir, safeName);
    fs.copyFileSync(filePath, tmpFilePath);

    try {
      const token = await this.getAccessToken();
      const folderId = await this.getDocumentFolderId(caseId, token);

      const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      const extKey = pathModule.extname(safeName).toLowerCase();
      const contentType = mimeTypes[extKey] || 'application/octet-stream';

      const form = new FormData();
      form.append('Content', fs.createReadStream(tmpFilePath), {
        filename: safeName,
        contentType,
      });
      const docMeta = {
        caseId: parseInt(caseId, 10),
        folderId,
        name: safeName,
        title: safeName,
      };
      form.append('document', JSON.stringify(docMeta));

      logger.info('Uploading document to Kleos', {
        caseId,
        folderId,
        safeName,
        contentType,
        tmpFilePath,
        documentMeta: docMeta,
      });

      const response = await axios.post(
        `${this.apiBaseUrl}/api/documents/upload`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${token}`,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        },
      );

      const documentId = response.data?.result ?? response.data?.data?.id ?? response.data?.id;
      logger.info('Document uploaded to Kleos', { documentId, safeName, caseId, folderId, kleosResponse: response.data });
      return String(documentId);
    } catch (error: any) {
      logger.error('Error uploading document to Kleos', {
        status: error.response?.status,
        kleosError: error.response?.data,
        message: error.message,
      });
      throw error;
    } finally {
      try { fs.unlinkSync(tmpFilePath); } catch {}
    }
  }

  async exportInquiry(inquiryId: string): Promise<void> {
    try {
      logger.info('Export started', { inquiryId });

      // Get inquiry data
      const inquiryResult = await query(
        `SELECT * FROM inquiries WHERE id = $1`,
        [inquiryId]
      );

      if (inquiryResult.rows.length === 0) {
        throw new Error('Inquiry not found');
      }

      const inquiry = inquiryResult.rows[0];
      logger.info('Export inquiry data', {
        inquiryId,
        legalArea: inquiry.legal_area,
        legalTopic: inquiry.legal_topic,
        channel: inquiry.channel,
      });

      // Case description: short summary (email body is uploaded as a PDF document)
      let caseDescription = '';
      if (inquiry.channel === 'email') {
        const emailResult = await query(
          `SELECT subject FROM email_intakes WHERE inquiry_id = $1 LIMIT 1`,
          [inquiryId]
        );
        const subject = emailResult.rows[0]?.subject || '';
        caseDescription = subject
          ? `E-Mail-Anfrage: ${subject}`
          : `E-Mail-Anfrage: ${inquiry.legal_area || 'Sonstiges'} - ${inquiry.legal_topic || 'Allgemein'}`;
      } else {
        caseDescription = `Anfrage: ${inquiry.legal_area || 'Sonstiges'} - ${inquiry.legal_topic || 'Allgemein'}`;
      }
      inquiry.description = caseDescription;
      logger.info('Export case description', { inquiryId, description: caseDescription });

      // Get contact
      const contactResult = await query(
        `SELECT * FROM contacts WHERE inquiry_id = $1`,
        [inquiryId]
      );

      if (contactResult.rows.length === 0) {
        throw new Error('Contact not found for inquiry');
      }

      const contact = contactResult.rows[0];
      logger.info('Export contact data', {
        inquiryId,
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
        phone: contact.phone_number,
      });

      // Get documents
      const documentsResult = await query(
        `SELECT * FROM documents WHERE inquiry_id = $1`,
        [inquiryId]
      );
      const pathModule = require('path');
      const docCount = documentsResult.rows.length;
      const docList = documentsResult.rows.map((d: any) => ({
        id: d.id,
        original_filename: d.original_filename,
        filepath: d.filepath,
        sanitized: this.sanitizeFilename(d.original_filename, (d.original_filename && pathModule.extname(d.original_filename)) || '.pdf'),
      }));
      logger.info('Export documents to upload', {
        inquiryId,
        docCount,
        documents: docList,
      });

      // Create identity in Kleos
      const kleosIdentityId = await this.createIdentity(contact);

      // Create case in Kleos
      const kleosCaseId = await this.createCase(inquiry, kleosIdentityId);
      const caseRef = inquiry.legal_area ? `${inquiry.legal_area} - ${inquiry.legal_topic || 'Allgemein'}` : 'case';
      logger.info('Export case created', { inquiryId, kleosCaseId, caseName: caseRef });

      // Upload documents
      const documentIds: string[] = [];

      if (docCount > 0) {
        logger.info(`Uploading ${docCount} document(s) to Kleos case ${kleosCaseId}`);
      }

      for (const doc of documentsResult.rows) {
        const ext = (doc.original_filename && pathModule.extname(doc.original_filename)) || '.pdf';
        const safeName = this.sanitizeFilename(doc.original_filename, ext);
        const wasSanitized = safeName !== (doc.original_filename || '').trim();
        try {
          const docId = await this.uploadDocument(kleosCaseId, doc.filepath, doc.original_filename);
          documentIds.push(docId);
          logger.info('Document uploaded to Kleos', {
            inquiryId,
            docId,
            original_filename: doc.original_filename,
            sanitized_filename: safeName,
            wasSanitized,
            kleosCaseId,
          });

          await query(
            `UPDATE documents SET kleos_document_id = $1 WHERE id = $2`,
            [docId, doc.id]
          );
        } catch (error: any) {
          logger.error('Document upload failed', {
            inquiryId,
            docId: doc.id,
            original_filename: doc.original_filename,
            sanitized_filename: safeName,
            wasSanitized,
            filepath: doc.filepath,
            httpStatus: error.response?.status,
            kleosError: error.response?.data,
            message: error.message,
          });
          // Export still succeeds — case and contact were created
        }
      }

      if (docCount > 0) {
        logger.warn(`Documents uploaded: ${documentIds.length}/${docCount}. If 0/${docCount}, contact Wolters Kluwer support to enable document upload for API client: ${process.env.KLEOS_CLIENT_ID}`);
      }

      // Update inquiry
      await query(
        `UPDATE inquiries 
         SET kleos_contact_id = $1, kleos_case_id = $2, exported_to_kleos_at = CURRENT_TIMESTAMP, status = 'completed'
         WHERE id = $3`,
        [kleosIdentityId, kleosCaseId, inquiryId]
      );

      // Log export
      await query(
        `INSERT INTO kleos_exports (inquiry_id, kleos_contact_id, kleos_case_id, export_status)
         VALUES ($1, $2, $3, $4)`,
        [inquiryId, kleosIdentityId, kleosCaseId, 'success']
      );

      logger.info('Export completed successfully', {
        inquiryId,
        kleosIdentityId,
        kleosCaseId,
        documentCount: documentIds.length,
        totalDocuments: docCount,
        documentIds,
      });
    } catch (error: any) {
      logger.error('Error exporting inquiry to Kleos', error);

      // Log failed export
      await query(
        `INSERT INTO kleos_exports (inquiry_id, export_status, error_message)
         VALUES ($1, $2, $3)`,
        [inquiryId, 'failed', error.message]
      );

      throw error;
    }
  }
}

export default new KleosService();

