import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { getTestPrismaClient, isDatabaseAvailable } from './helpers/db.js';

describe('Database Tests', () => {
  let prisma: ReturnType<typeof getTestPrismaClient> | null = null;

  beforeAll(async () => {
    // Skip all tests if database is not available
    if (!(await isDatabaseAvailable())) {
      console.warn('Test database not available. Skipping database tests.');
      return;
    }
    prisma = getTestPrismaClient();
  });

  beforeEach(async () => {
    // Skip cleanup if database is not available
    if (!prisma || !(await isDatabaseAvailable())) {
      return;
    }

    // Clean up before each test
    try {
      if (prisma) {
        await prisma.embeddingItem.deleteMany();
        await prisma.refreshToken.deleteMany();
        await prisma.calendarEvent.deleteMany();
        await prisma.todoComment.deleteMany();
        await prisma.todo.deleteMany();
        await prisma.workspaceMember.deleteMany();
        await prisma.workspace.deleteMany();
        await prisma.user.deleteMany();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('User Model', () => {
    it('should create a user', async () => {
      if (!prisma) {
        return; // Skip if database not available
      }

      const passwordHash = await bcrypt.hash('password123', 10);

      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          passwordHash,
          name: 'Test User',
        },
      });

      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.id).toBeDefined();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should enforce unique email constraint', async () => {
      if (!prisma) {
        return; // Skip if database not available
      }

      const passwordHash = await bcrypt.hash('password123', 10);

      await prisma!.user.create({
        data: {
          email: 'duplicate@example.com',
          passwordHash,
        },
      });

      await expect(
        prisma!.user.create({
          data: {
            email: 'duplicate@example.com',
            passwordHash,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Workspace Model', () => {
    it('should create a workspace with owner', async () => {
      if (!prisma) {
        return; // Skip if database not available
      }

      const passwordHash = await bcrypt.hash('password123', 10);

      const user = await prisma.user.create({
        data: {
          email: 'owner@example.com',
          passwordHash,
          name: 'Owner',
        },
      });

      const workspace = await prisma.workspace.create({
        data: {
          name: 'Test Workspace',
          ownerId: user.id,
        },
      });

      expect(workspace).toBeDefined();
      expect(workspace.name).toBe('Test Workspace');
      expect(workspace.ownerId).toBe(user.id);
    });

    it('should cascade delete workspace when owner is deleted', async () => {
      if (!prisma) {
        return; // Skip if database not available
      }

      const passwordHash = await bcrypt.hash('password123', 10);

      const user = await prisma.user.create({
        data: {
          email: 'owner@example.com',
          passwordHash,
        },
      });

      const workspace = await prisma.workspace.create({
        data: {
          name: 'Test Workspace',
          ownerId: user.id,
        },
      });

      await prisma.user.delete({
        where: { id: user.id },
      });

      const deletedWorkspace = await prisma.workspace.findUnique({
        where: { id: workspace.id },
      });

      expect(deletedWorkspace).toBeNull();
    });
  });

  describe('WorkspaceMember Model', () => {
    it('should create a workspace member', async () => {
      if (!prisma) {
        return; // Skip if database not available
      }

      const passwordHash = await bcrypt.hash('password123', 10);

      const owner = await prisma.user.create({
        data: {
          email: 'owner@example.com',
          passwordHash,
        },
      });

      const member = await prisma.user.create({
        data: {
          email: 'member@example.com',
          passwordHash,
        },
      });

      const workspace = await prisma.workspace.create({
        data: {
          name: 'Test Workspace',
          ownerId: owner.id,
        },
      });

      const workspaceMember = await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: member.id,
          role: 'MEMBER',
        },
      });

      expect(workspaceMember).toBeDefined();
      expect(workspaceMember.role).toBe('MEMBER');
    });
  });

  describe('Todo Model', () => {
    it('should create a todo', async () => {
      if (!prisma) {
        return; // Skip if database not available
      }

      const passwordHash = await bcrypt.hash('password123', 10);

      const user = await prisma.user.create({
        data: {
          email: 'creator@example.com',
          passwordHash,
        },
      });

      const workspace = await prisma.workspace.create({
        data: {
          name: 'Test Workspace',
          ownerId: user.id,
        },
      });

      const todo = await prisma.todo.create({
        data: {
          workspaceId: workspace.id,
          title: 'Test Todo',
          description: 'Test Description',
          createdById: user.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      expect(todo).toBeDefined();
      expect(todo.title).toBe('Test Todo');
      expect(todo.status).toBe('TODO');
      expect(todo.priority).toBe('MEDIUM');
    });
  });
});

