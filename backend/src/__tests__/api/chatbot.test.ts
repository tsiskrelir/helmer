import 'express-async-errors';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import chatbotRoutes from '../../api/routes/chatbot';
import { errorHandler } from '../../middleware/errorHandler';

// Create test app
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/chatbot', chatbotRoutes);
app.use(errorHandler);

describe('Chatbot API', () => {
  beforeAll(async () => {
    // Ensure database is set up
    // In real tests, you'd use a test database
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('POST /api/chatbot/session', () => {
    it('should create a new session', async () => {
      const response = await request(app)
        .post('/api/chatbot/session')
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('step');
      expect(response.body.step.type).toBe('choice');
    });

    it('should return start step with correct message', async () => {
      const response = await request(app)
        .post('/api/chatbot/session')
        .expect(200);

      expect(response.body.step.message).toContain('Willkommen bei der Kanzlei Tieben');
      expect(response.body.step.options).toHaveLength(6);
    });
  });

  describe('GET /api/chatbot/session/:sessionId', () => {
    it('should get session data', async () => {
      // First create a session
      const createResponse = await request(app)
        .post('/api/chatbot/session')
        .expect(200);
      
      const sid = createResponse.body.sessionId;

      const response = await request(app)
        .get(`/api/chatbot/session/${sid}`)
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('currentStep');
      expect(response.body).toHaveProperty('step');
      expect(response.body).toHaveProperty('history');
    });

    it('should return 404 for non-existent session', async () => {
      await request(app)
        .get('/api/chatbot/session/invalid-session-id')
        .expect(404);
    });
  });

  describe('POST /api/chatbot/message', () => {
    it('should handle text message', async () => {
      // Create session first
      const createResponse = await request(app)
        .post('/api/chatbot/session')
        .expect(200);
      
      const sid = createResponse.body.sessionId;

      const response = await request(app)
        .post('/api/chatbot/message')
        .send({
          sessionId: sid,
          message: 'Test message'
        })
        .expect(200);

      expect(response.body).toHaveProperty('step');
      expect(response.body).toHaveProperty('collectedData');
    });

    it('should handle choice selection', async () => {
      // Create session first
      const createResponse = await request(app)
        .post('/api/chatbot/session')
        .expect(200);
      
      const sid = createResponse.body.sessionId;

      const response = await request(app)
        .post('/api/chatbot/message')
        .send({
          sessionId: sid,
          choiceIndex: 0
        })
        .expect(200);

      expect(response.body).toHaveProperty('step');
      expect(response.body.step.type).toBe('input');
    });

    it('should return 400 if sessionId is missing', async () => {
      await request(app)
        .post('/api/chatbot/message')
        .send({ message: 'Test' })
        .expect(400);
    });
  });

  describe('POST /api/chatbot/contact', () => {
    it('should submit contact form', async () => {
      // Create session
      const createResponse = await request(app)
        .post('/api/chatbot/session')
        .expect(200);
      
      const sid = createResponse.body.sessionId;

      // Navigate through flow: Select "Sonstiges Anliegen" (index 5)
      await request(app)
        .post('/api/chatbot/message')
        .send({ sessionId: sid, choiceIndex: 5 })
        .expect(200);

      // Enter description
      await request(app)
        .post('/api/chatbot/message')
        .send({ sessionId: sid, message: 'Test description' })
        .expect(200);

      // Select "Nein" for document upload (index 1) - goes to contact_form
      await request(app)
        .post('/api/chatbot/message')
        .send({ sessionId: sid, choiceIndex: 1 })
        .expect(200);

      // Now submit contact form
      const response = await request(app)
        .post('/api/chatbot/contact')
        .send({
          sessionId: sid,
          name: 'Test User',
          email: 'test@example.com',
          phone: '+49123456789'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
    });

    it('should return 400 if required fields are missing', async () => {
      await request(app)
        .post('/api/chatbot/contact')
        .send({
          sessionId: 'test-session',
          name: 'Test User'
          // Missing email and phone
        })
        .expect(400);
    });
  });
});

