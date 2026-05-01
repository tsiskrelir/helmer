import 'express-async-errors';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import adminRoutes from '../../api/routes/admin';
import { query } from '../../database/connection';
import { errorHandler } from '../../middleware/errorHandler';

// Create test app
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/admin', adminRoutes);
app.use(errorHandler);

describe('Admin API', () => {
  let testInquiryId: string;

  beforeAll(async () => {
    // Create a test inquiry
    const result = await query(
      `INSERT INTO inquiries (status, legal_area, legal_topic, channel)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['new', 'Arbeitsrecht', 'Kündigung', 'chatbot']
    );
    testInquiryId = result.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test data
    if (testInquiryId) {
      await query('DELETE FROM inquiries WHERE id = $1', [testInquiryId]);
    }
  });

  describe('GET /api/admin/inquiries', () => {
    it('should return list of inquiries', async () => {
      const response = await request(app)
        .get('/api/admin/inquiries')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('inquiries');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.inquiries)).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/admin/inquiries')
        .query({ status: 'new' })
        .expect(200);

      response.body.inquiries.forEach((inquiry: any) => {
        expect(inquiry.status).toBe('new');
      });
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/admin/inquiries')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });
  });

  describe('GET /api/admin/inquiries/:id', () => {
    it('should return inquiry details', async () => {
      const response = await request(app)
        .get(`/api/admin/inquiries/${testInquiryId}`)
        .expect(200);

      expect(response.body).toHaveProperty('inquiry');
      expect(response.body).toHaveProperty('contact');
      expect(response.body).toHaveProperty('conversations');
      expect(response.body).toHaveProperty('documents');
      expect(response.body.inquiry.id).toBe(testInquiryId);
    });

    it('should return 404 for non-existent inquiry', async () => {
      await request(app)
        .get('/api/admin/inquiries/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('PATCH /api/admin/inquiries/:id/status', () => {
    it('should update inquiry status', async () => {
      const response = await request(app)
        .patch(`/api/admin/inquiries/${testInquiryId}/status`)
        .send({ status: 'in_progress' })
        .expect(200);

      expect(response.body.inquiry.status).toBe('in_progress');
    });

    it('should reject invalid status', async () => {
      await request(app)
        .patch(`/api/admin/inquiries/${testInquiryId}/status`)
        .send({ status: 'invalid_status' })
        .expect(400);
    });
  });

  describe('GET /api/admin/stats', () => {
    it('should return statistics', async () => {
      const response = await request(app)
        .get('/api/admin/stats')
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('total_count');
      expect(response.body.stats).toHaveProperty('new_count');
      expect(response.body.stats).toHaveProperty('in_progress_count');
      expect(response.body.stats).toHaveProperty('completed_count');
      expect(response.body.stats).toHaveProperty('rejected_count');
    });
  });
});

