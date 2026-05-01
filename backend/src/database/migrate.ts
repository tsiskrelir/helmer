import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { query } from './connection';
import { logger } from '../utils/logger';

async function migrate() {
  try {
    logger.info('Starting database migration...');
    
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    await query(schema);
    
    logger.info('Database migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', error);
    process.exit(1);
  }
}

migrate();

