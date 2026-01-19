import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '../src/config/env.js';

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Initialize PrismaClient with adapter
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting seed...');

  // Hash password for test user
  const passwordHash = await bcrypt.hash('testpassword123', 10);

  // Create user and workspace in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create user
    const user = await tx.user.create({
      data: {
        email: 'test@example.com',
        passwordHash,
        name: 'Test User',
      },
    });

    console.log('Created user:', user.id);

    // Create workspace
    const workspace = await tx.workspace.create({
      data: {
        name: 'My Workspace',
        ownerId: user.id,
      },
    });

    console.log('Created workspace:', workspace.id);

    // Create workspace member entry
    const workspaceMember = await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: 'OWNER',
      },
    });

    console.log('Created workspace member:', workspaceMember);

    return { user, workspace, workspaceMember };
  });

  console.log('Seed completed successfully!');
  console.log('User ID:', result.user.id);
  console.log('Workspace ID:', result.workspace.id);
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
