import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '../config/env.js';

/**
 * Normalize database URL to explicitly set SSL mode
 * Replaces deprecated SSL modes (prefer, require, verify-ca) with verify-full
 * Adds sslmode=verify-full if not present
 */
function normalizeDatabaseUrl(url: string): string {
  if (!url) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);

    // Check if sslmode exists and if it's a deprecated value
    const sslmode = params.get('sslmode');
    const deprecatedModes = ['prefer', 'require', 'verify-ca'];

    if (!sslmode || deprecatedModes.includes(sslmode)) {
      // Replace or add sslmode=verify-full
      params.set('sslmode', 'verify-full');
      urlObj.search = params.toString();
      return urlObj.toString();
    }

    // Already has a non-deprecated sslmode, return as-is
    return url;
  } catch (error) {
    // If URL parsing fails, return original URL
    // This handles edge cases where URL might be malformed
    return url;
  }
}

/**
 * Get database URL, preferring TEST_DATABASE_URL in test environment
 */
function getDatabaseUrl(): string {
  let url: string;
  // In test mode, always prefer TEST_DATABASE_URL if available
  // Check process.env.NODE_ENV directly to ensure we catch test mode even if env was loaded before NODE_ENV was set
  if (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL) {
    url = process.env.TEST_DATABASE_URL;
  } else if (env.NODE_ENV === 'test' && env.TEST_DATABASE_URL) {
    url = env.TEST_DATABASE_URL;
  } else {
    url = env.DATABASE_URL || '';
  }

  // Normalize URL to fix SSL mode warnings
  return normalizeDatabaseUrl(url);
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

