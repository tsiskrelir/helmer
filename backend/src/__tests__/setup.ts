import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Set test environment
process.env.NODE_ENV = 'test';

// Use main database for testing (or override with kleos_intake_test if it exists)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/kleos_intake';
}

