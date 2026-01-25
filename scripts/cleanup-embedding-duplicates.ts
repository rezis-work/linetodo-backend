import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

dotenv.config();

// Get database URL from environment
const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_DIRECT;

if (!databaseUrl) {
  console.error('DATABASE_URL or DATABASE_URL_DIRECT must be set');
  process.exit(1);
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: databaseUrl,
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Initialize PrismaClient with adapter
const prisma = new PrismaClient({ adapter });

async function cleanupDuplicates() {
  console.log('Checking for duplicate EmbeddingItem records...');

  // Find duplicates using raw SQL
  const duplicates = await prisma.$queryRaw<Array<{ sourceType: string; sourceId: string; count: bigint }>>`
    SELECT "sourceType", "sourceId", COUNT(*) as count
    FROM "EmbeddingItem"
    GROUP BY "sourceType", "sourceId"
    HAVING COUNT(*) > 1
  `;

  if (duplicates.length === 0) {
    console.log('✅ No duplicates found. Safe to proceed with migration.');
    return;
  }

  console.log(`⚠️  Found ${duplicates.length} duplicate groups. Cleaning up...`);

  for (const dup of duplicates) {
    // Get all records for this duplicate group, ordered by updatedAt (most recent first)
    const records = await prisma.embeddingItem.findMany({
      where: {
        sourceType: dup.sourceType as any,
        sourceId: dup.sourceId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Keep the first (most recent) one, delete the rest
    const toKeep = records[0];
    const toDelete = records.slice(1);

    console.log(
      `  - ${dup.sourceType}:${dup.sourceId} - Keeping ${toKeep.id}, deleting ${toDelete.length} duplicate(s)`
    );

    for (const record of toDelete) {
      await prisma.embeddingItem.delete({
        where: { id: record.id },
      });
    }
  }

  console.log('✅ Cleanup complete. Safe to proceed with migration.');
}

cleanupDuplicates()
  .catch((error) => {
    console.error('Error cleaning up duplicates:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

