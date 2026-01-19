import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '../config/env.js';

/**
 * Get database URL, preferring TEST_DATABASE_URL in test environment
 */
function getDatabaseUrl(): string {
  // In test mode, prefer TEST_DATABASE_URL if available
  if ((env.NODE_ENV === 'test' || env.NODE_ENV === 'development') && process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  return env.DATABASE_URL || '';
}

// Create PostgreSQL connection pool
// Use same connection settings as test Prisma instance for consistency
const pool = new Pool({
  connectionString: getDatabaseUrl(),
  // In test mode, use single connection like test helper to ensure consistency
  ...(env.NODE_ENV === 'test' && { max: 1 }),
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Initialize PrismaClient with adapter
export const prisma = new PrismaClient({ adapter });

