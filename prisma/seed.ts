import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

async function main() {
  console.log('Starting seed...');

  // Hash password for test user
  const passwordHash = await hashPassword('testpassword123');

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
  });
