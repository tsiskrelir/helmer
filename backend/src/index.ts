// (c) 2026 Legal Intake System -- developed by Rechtsanwalt Tieben
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { query } from './database/connection';
import chatbotRoutes from './api/routes/chatbot';
import adminRoutes from './api/routes/admin';
import emailRoutes from './api/routes/email';
import emailParserService from './services/emailParserService';
import dataRetentionService from './services/dataRetentionService';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (uploads, widget)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/widget', express.static(path.join(__dirname, '../../frontend/widget')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/email', emailRoutes);

// Error handling
app.use(errorHandler);

async function runMigration() {
  try {
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await query(schema);
    logger.info('Database migration completed');
  } catch (error) {
    logger.error('Database migration failed', error);
    throw error;
  }
}

// Run migration then start server
runMigration().then(() => {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    if (process.env.NODE_ENV !== 'test') {
      emailParserService.startPolling();
      dataRetentionService.startScheduledCleanup();
    }
  });
}).catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});

export default app;

