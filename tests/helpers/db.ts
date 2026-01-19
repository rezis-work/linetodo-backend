import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

let prisma: PrismaClient | null = null;
let pool: Pool | null = null;
let dbAvailable: boolean | null = null;

// Export pool and adapter so app can use them in test mode
export function getTestPool(): Pool | null {
  return pool;
}

export function getTestPrismaClientInstance(): PrismaClient | null {
  return prisma;
}

/**
 * Get DATABASE_URL from environment, handling test mode
 */
function getDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  return url && url.trim() !== '' ? url : undefined;
}

/**
 * Check if database is available
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  if (dbAvailable !== null) {
    return dbAvailable;
  }

  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    dbAvailable = false;
    return false;
  }

  try {
    const client = getTestPrismaClient();
    await client.$queryRaw`SELECT 1`;
    dbAvailable = true;
    return true;
  } catch {
    dbAvailable = false;
    return false;
  }
}

/**
 * Get or create a Prisma client instance for testing
 */
export function getTestPrismaClient(): PrismaClient {
  if (!prisma) {
    const dbUrl = getDatabaseUrl();
    if (!dbUrl) {
      throw new Error(
        'DATABASE_URL or TEST_DATABASE_URL must be set for database tests'
      );
    }

    // Create PostgreSQL connection pool for tests
    pool = new Pool({
      connectionString: dbUrl,
      max: 1, // Use single connection for tests
    });

    // Create Prisma adapter
    const adapter = new PrismaPg(pool);

    // Initialize PrismaClient with adapter
    prisma = new PrismaClient({ adapter });
  }

  return prisma;
}

/**
 * Clean up test database - truncate all tables
 */
export async function cleanupDatabase(): Promise<void> {
  if (!(await isDatabaseAvailable())) {
    return;
  }

  const client = getTestPrismaClient();

  try {
    // Delete in reverse order of dependencies
    await client.embeddingItem.deleteMany();
    await client.refreshToken.deleteMany();
    await client.calendarEvent.deleteMany();
    await client.todoComment.deleteMany();
    await client.todo.deleteMany();
    await client.workspaceMember.deleteMany();
    await client.workspace.deleteMany();
    await client.user.deleteMany();
  } catch (error) {
    // Silently fail if database is not available
    console.warn('Failed to cleanup database:', error);
  }
}

/**
 * Disconnect from test database
 */
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    try {
      await prisma.$disconnect();
    } catch {
      // Ignore disconnect errors
    }
    prisma = null;
  }
  if (pool) {
    try {
      await pool.end();
    } catch {
      // Ignore pool end errors
    }
    pool = null;
  }
  dbAvailable = null;
}

