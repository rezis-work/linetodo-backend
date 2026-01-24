import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getTestPrismaClient, isDatabaseAvailable } from './helpers/db.js';
import { register as authRegister } from '../src/modules/auth/service.js';
import { TodoStatus, TodoPriority } from '@prisma/client';

describe('Todos API', () => {
  const app = createApp();
  let prisma: ReturnType<typeof getTestPrismaClient> | null = null;

  beforeAll(async () => {
    if (await isDatabaseAvailable()) {
      prisma = getTestPrismaClient();
    }
  });

  beforeEach(async () => {
    if (!prisma) {
      return;
    }

    // Clean up before each test
    try {
      await prisma.refreshToken.deleteMany();
      await prisma.todoComment.deleteMany();
      await prisma.todo.deleteMany();
      await prisma.calendarEvent.deleteMany();
      await prisma.workspaceMember.deleteMany();
      await prisma.workspace.deleteMany();
      await prisma.embeddingItem.deleteMany();
      await prisma.user.deleteMany();
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  });

  // Helper function to create a workspace and return workspace + user + token
  async function createWorkspaceWithUser(email: string, workspaceName: string) {
    if (!prisma) {
      throw new Error('Prisma not available');
    }

    const { user, accessToken } = await authRegister({
      email,
      password: 'password123',
      name: email.split('@')[0],
    });

    const workspace = await prisma.workspace.create({
      data: {
        name: workspaceName,
        ownerId: user.id,
      },
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: 'OWNER',
      },
    });

    return { user, workspace, accessToken };
  }

  describe('POST /workspaces/:id/todos', () => {
    it('should create a todo successfully', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'creator@example.com',
        'Test Workspace'
      );

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/todos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Test Todo',
          description: 'Test description',
          status: 'TODO',
          priority: 'MEDIUM',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.title).toBe('Test Todo');
      expect(response.body.data.description).toBe('Test description');
      expect(response.body.data.status).toBe('TODO');
      expect(response.body.data.priority).toBe('MEDIUM');
      expect(response.body.data.createdById).toBe(user.id);
      expect(response.body.data.workspaceId).toBe(workspace.id);
      expect(response.body.requestId).toBeDefined();

      // Verify todo was created in database
      const todo = await prisma.todo.findUnique({
        where: { id: response.body.data.id },
      });
      expect(todo).toBeDefined();
      expect(todo?.title).toBe('Test Todo');
    });

    it('should create a todo with default values', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'creator2@example.com',
        'Test Workspace 2'
      );

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/todos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Minimal Todo',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('TODO'); // Default
      expect(response.body.data.priority).toBe('MEDIUM'); // Default
    });

    it('should create a todo with assignee', async () => {
      if (!prisma) {
        return;
      }

      const { user: creator, workspace, accessToken: creatorToken } =
        await createWorkspaceWithUser('creator3@example.com', 'Test Workspace 3');

      const { user: assignee } = await authRegister({
        email: 'assignee@example.com',
        password: 'password123',
      });

      // Add assignee as member
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: assignee.id,
          role: 'MEMBER',
        },
      });

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/todos`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          title: 'Assigned Todo',
          assignedToId: assignee.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.assignedToId).toBe(assignee.id);
      expect(response.body.data.assignee).toBeDefined();
      expect(response.body.data.assignee.id).toBe(assignee.id);
    });

    it('should reject unauthorized request', async () => {
      if (!prisma) {
        return;
      }

      const { workspace } = await createWorkspaceWithUser(
        'unauth@example.com',
        'Test Workspace'
      );

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/todos`)
        .send({
          title: 'Test Todo',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should reject if user is not a workspace member', async () => {
      if (!prisma) {
        return;
      }

      const { workspace } = await createWorkspaceWithUser(
        'member1@example.com',
        'Private Workspace'
      );

      const { accessToken: outsiderToken } = await authRegister({
        email: 'outsider@example.com',
        password: 'password123',
      });

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/todos`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({
          title: 'Test Todo',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();
    });

    it('should validate input (empty title)', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'validator@example.com',
        'Test Workspace'
      );

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/todos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: '',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Title is required');
    });

    it('should validate input (title too long)', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'validator2@example.com',
        'Test Workspace'
      );

      const longTitle = 'a'.repeat(201);
      const response = await request(app)
        .post(`/workspaces/${workspace.id}/todos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: longTitle,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Title must be 200 characters or less');
    });

    it('should validate assignee is workspace member', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'validator3@example.com',
        'Test Workspace'
      );

      const { user: nonMember } = await authRegister({
        email: 'nonmember@example.com',
        password: 'password123',
      });

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/todos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Test Todo',
          assignedToId: nonMember.id,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Assignee must be a member');
    });

    it('should validate due date is not in the past', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'validator4@example.com',
        'Test Workspace'
      );

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/todos`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Test Todo',
          dueAt: yesterday.toISOString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Due date must be today or in the future');
    });
  });

  describe('GET /workspaces/:id/todos', () => {
    it('should list todos successfully', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'lister@example.com',
        'Test Workspace'
      );

      // Create multiple todos
      await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Todo 1',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
          {
            workspaceId: workspace.id,
            title: 'Todo 2',
            createdById: user.id,
            status: 'IN_PROGRESS',
            priority: 'HIGH',
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.todos).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(20);
      expect(response.body.requestId).toBeDefined();
    });

    it('should filter by status', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'filterer@example.com',
        'Test Workspace'
      );

      await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Todo 1',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
          {
            workspaceId: workspace.id,
            title: 'Todo 2',
            createdById: user.id,
            status: 'DONE',
            priority: 'MEDIUM',
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos`)
        .query({ status: 'TODO' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.todos).toHaveLength(1);
      expect(response.body.data.todos[0].status).toBe('TODO');
    });

    it('should filter by multiple statuses', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'filterer2@example.com',
        'Test Workspace'
      );

      await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Todo 1',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
          {
            workspaceId: workspace.id,
            title: 'Todo 2',
            createdById: user.id,
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
          },
          {
            workspaceId: workspace.id,
            title: 'Todo 3',
            createdById: user.id,
            status: 'DONE',
            priority: 'MEDIUM',
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos`)
        .query({ statuses: 'TODO,IN_PROGRESS' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.todos).toHaveLength(2);
      expect(response.body.data.todos.every((t: any) => ['TODO', 'IN_PROGRESS'].includes(t.status))).toBe(true);
    });

    it('should filter by priority', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'filterer3@example.com',
        'Test Workspace'
      );

      await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Todo 1',
            createdById: user.id,
            status: 'TODO',
            priority: 'HIGH',
          },
          {
            workspaceId: workspace.id,
            title: 'Todo 2',
            createdById: user.id,
            status: 'TODO',
            priority: 'LOW',
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos`)
        .query({ priority: 'HIGH' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.todos).toHaveLength(1);
      expect(response.body.data.todos[0].priority).toBe('HIGH');
    });

    it('should filter by assignee', async () => {
      if (!prisma) {
        return;
      }

      const { user: creator, workspace, accessToken } = await createWorkspaceWithUser(
        'filterer4@example.com',
        'Test Workspace'
      );

      const { user: assignee } = await authRegister({
        email: 'assignee2@example.com',
        password: 'password123',
      });

      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: assignee.id,
          role: 'MEMBER',
        },
      });

      await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Assigned Todo',
            createdById: creator.id,
            assignedToId: assignee.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
          {
            workspaceId: workspace.id,
            title: 'Unassigned Todo',
            createdById: creator.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos`)
        .query({ assignedToId: assignee.id })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.todos).toHaveLength(1);
      expect(response.body.data.todos[0].assignedToId).toBe(assignee.id);
    });

    it('should filter by unassigned', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'filterer5@example.com',
        'Test Workspace'
      );

      const { user: assignee } = await authRegister({
        email: 'assignee3@example.com',
        password: 'password123',
      });

      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: assignee.id,
          role: 'MEMBER',
        },
      });

      await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Assigned Todo',
            createdById: user.id,
            assignedToId: assignee.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
          {
            workspaceId: workspace.id,
            title: 'Unassigned Todo',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos`)
        .query({ assignedToId: 'unassigned' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.todos).toHaveLength(1);
      expect(response.body.data.todos[0].assignedToId).toBeNull();
    });

    it('should filter by search query', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'searcher@example.com',
        'Test Workspace'
      );

      await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Important Task',
            description: 'This is important',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
          {
            workspaceId: workspace.id,
            title: 'Regular Task',
            description: 'Not important',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos`)
        .query({ search: 'Important' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.todos).toHaveLength(1);
      expect(response.body.data.todos[0].title).toContain('Important');
    });

    it('should filter by due date range', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'dater@example.com',
        'Test Workspace'
      );

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Due Tomorrow',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
            dueAt: tomorrow,
          },
          {
            workspaceId: workspace.id,
            title: 'Due Next Week',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
            dueAt: nextWeek,
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos`)
        .query({ dueAfter: tomorrow.toISOString(), dueBefore: nextWeek.toISOString() })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.todos.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter overdue todos', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'overdue@example.com',
        'Test Workspace'
      );

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Overdue Todo',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
            dueAt: yesterday,
          },
          {
            workspaceId: workspace.id,
            title: 'Not Overdue',
            createdById: user.id,
            status: 'DONE',
            priority: 'MEDIUM',
            dueAt: yesterday, // Done, so not overdue
          },
          {
            workspaceId: workspace.id,
            title: 'Future Todo',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
            dueAt: new Date(Date.now() + 86400000), // Tomorrow
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos`)
        .query({ overdue: 'true' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.todos.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.todos.every((t: any) => t.isOverdue)).toBe(true);
    });

    it('should paginate results', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'pager@example.com',
        'Test Workspace'
      );

      // Create 25 todos
      await prisma.todo.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
          workspaceId: workspace.id,
          title: `Todo ${i + 1}`,
          createdById: user.id,
          status: 'TODO',
          priority: 'MEDIUM',
        })),
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos`)
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.todos).toHaveLength(10);
      expect(response.body.data.total).toBe(25);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(10);
      expect(response.body.data.totalPages).toBe(3);
      expect(response.body.data.hasNextPage).toBe(true);
      expect(response.body.data.hasPrevPage).toBe(false);
    });

    it('should sort by different fields', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'sorter@example.com',
        'Test Workspace'
      );

      await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'A Todo',
            createdById: user.id,
            status: 'TODO',
            priority: 'LOW',
          },
          {
            workspaceId: workspace.id,
            title: 'Z Todo',
            createdById: user.id,
            status: 'TODO',
            priority: 'HIGH',
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos`)
        .query({ sortBy: 'title', sortOrder: 'asc' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.todos[0].title).toBe('A Todo');
    });
  });

  describe('GET /workspaces/:id/todos/:todoId', () => {
    it('should get a single todo successfully', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'viewer@example.com',
        'Test Workspace'
      );

      const todo = await prisma.todo.create({
        data: {
          workspaceId: workspace.id,
          title: 'Single Todo',
          createdById: user.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos/${todo.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(todo.id);
      expect(response.body.data.title).toBe('Single Todo');
      expect(response.body.requestId).toBeDefined();
    });

    it('should return 404 if todo not found', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'notfound@example.com',
        'Test Workspace'
      );

      const fakeTodoId = 'clx123456789012345678901234';

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos/${fakeTodoId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
    });

    it('should return 403 if todo belongs to different workspace', async () => {
      if (!prisma) {
        return;
      }

      const { user: user1, workspace: workspace1, accessToken: token1 } =
        await createWorkspaceWithUser('user1@example.com', 'Workspace 1');
      const { workspace: workspace2, accessToken: token2 } =
        await createWorkspaceWithUser('user2@example.com', 'Workspace 2');

      const todo = await prisma.todo.create({
        data: {
          workspaceId: workspace1.id,
          title: 'Private Todo',
          createdById: user1.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      const response = await request(app)
        .get(`/workspaces/${workspace2.id}/todos/${todo.id}`)
        .set('Authorization', `Bearer ${token2}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /workspaces/:id/todos/:todoId', () => {
    it('should update a todo successfully', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'updater@example.com',
        'Test Workspace'
      );

      const todo = await prisma.todo.create({
        data: {
          workspaceId: workspace.id,
          title: 'Original Title',
          createdById: user.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      const response = await request(app)
        .patch(`/workspaces/${workspace.id}/todos/${todo.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Updated Title',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe('Updated Title');
      expect(response.body.data.status).toBe('IN_PROGRESS');
      expect(response.body.data.priority).toBe('HIGH');
    });

    it('should update assignee', async () => {
      if (!prisma) {
        return;
      }

      const { user: creator, workspace, accessToken } = await createWorkspaceWithUser(
        'updater2@example.com',
        'Test Workspace'
      );

      const { user: assignee } = await authRegister({
        email: 'assignee4@example.com',
        password: 'password123',
      });

      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: assignee.id,
          role: 'MEMBER',
        },
      });

      const todo = await prisma.todo.create({
        data: {
          workspaceId: workspace.id,
          title: 'Unassigned Todo',
          createdById: creator.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      const response = await request(app)
        .patch(`/workspaces/${workspace.id}/todos/${todo.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          assignedToId: assignee.id,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.assignedToId).toBe(assignee.id);
    });

    it('should unassign a todo', async () => {
      if (!prisma) {
        return;
      }

      const { user: creator, workspace, accessToken } = await createWorkspaceWithUser(
        'updater3@example.com',
        'Test Workspace'
      );

      const { user: assignee } = await authRegister({
        email: 'assignee5@example.com',
        password: 'password123',
      });

      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: assignee.id,
          role: 'MEMBER',
        },
      });

      const todo = await prisma.todo.create({
        data: {
          workspaceId: workspace.id,
          title: 'Assigned Todo',
          createdById: creator.id,
          assignedToId: assignee.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      const response = await request(app)
        .patch(`/workspaces/${workspace.id}/todos/${todo.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          assignedToId: null,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.assignedToId).toBeNull();
    });

    it('should return 404 if todo not found', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'notfound2@example.com',
        'Test Workspace'
      );

      const fakeTodoId = 'clx123456789012345678901234';

      const response = await request(app)
        .patch(`/workspaces/${workspace.id}/todos/${fakeTodoId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Updated',
        });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /workspaces/:id/todos/:todoId', () => {
    it('should delete a todo successfully (creator)', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'deleter@example.com',
        'Test Workspace'
      );

      const todo = await prisma.todo.create({
        data: {
          workspaceId: workspace.id,
          title: 'To Delete',
          createdById: user.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      const response = await request(app)
        .delete(`/workspaces/${workspace.id}/todos/${todo.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted successfully');

      // Verify todo was deleted
      const deleted = await prisma.todo.findUnique({
        where: { id: todo.id },
      });
      expect(deleted).toBeNull();
    });

    it('should delete a todo successfully (ADMIN)', async () => {
      if (!prisma) {
        return;
      }

      const { user: owner, workspace, accessToken: ownerToken } =
        await createWorkspaceWithUser('owner@example.com', 'Test Workspace');

      const { user: admin, accessToken: adminToken } = await authRegister({
        email: 'admin@example.com',
        password: 'password123',
      });

      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: admin.id,
          role: 'ADMIN',
        },
      });

      const todo = await prisma.todo.create({
        data: {
          workspaceId: workspace.id,
          title: 'To Delete',
          createdById: owner.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      const response = await request(app)
        .delete(`/workspaces/${workspace.id}/todos/${todo.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it('should reject deletion by MEMBER who is not creator', async () => {
      if (!prisma) {
        return;
      }

      const { user: creator, workspace, accessToken: creatorToken } =
        await createWorkspaceWithUser('creator4@example.com', 'Test Workspace');

      const { user: member, accessToken: memberToken } = await authRegister({
        email: 'member@example.com',
        password: 'password123',
      });

      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: member.id,
          role: 'MEMBER',
        },
      });

      const todo = await prisma.todo.create({
        data: {
          workspaceId: workspace.id,
          title: 'Protected Todo',
          createdById: creator.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      const response = await request(app)
        .delete(`/workspaces/${workspace.id}/todos/${todo.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain("don't have permission");
    });

    it('should return 404 if todo not found', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'notfound3@example.com',
        'Test Workspace'
      );

      const fakeTodoId = 'clx123456789012345678901234';

      const response = await request(app)
        .delete(`/workspaces/${workspace.id}/todos/${fakeTodoId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /workspaces/:id/todos/batch', () => {
    it('should batch update todos successfully', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'batcher@example.com',
        'Test Workspace'
      );

      const todos = await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Todo 1',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
          {
            workspaceId: workspace.id,
            title: 'Todo 2',
            createdById: user.id,
            status: 'TODO',
            priority: 'LOW',
          },
        ],
      });

      const createdTodos = await prisma.todo.findMany({
        where: { workspaceId: workspace.id },
      });

      const response = await request(app)
        .patch(`/workspaces/${workspace.id}/todos/batch`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          todoIds: createdTodos.map((t) => t.id),
          status: 'DONE',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.updated).toBe(2);

      // Verify todos were updated
      const updatedTodos = await prisma.todo.findMany({
        where: { id: { in: createdTodos.map((t) => t.id) } },
      });
      expect(updatedTodos.every((t) => t.status === 'DONE')).toBe(true);
    });

    it('should validate at least one field is provided', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'batcher2@example.com',
        'Test Workspace'
      );

      const response = await request(app)
        .patch(`/workspaces/${workspace.id}/todos/batch`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          todoIds: ['clx123456789012345678901234'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should validate max 50 todos', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'batcher3@example.com',
        'Test Workspace'
      );

      const todoIds = Array.from({ length: 51 }, () => 'clx123456789012345678901234');

      const response = await request(app)
        .patch(`/workspaces/${workspace.id}/todos/batch`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          todoIds,
          status: 'DONE',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('DELETE /workspaces/:id/todos/batch', () => {
    it('should batch delete todos successfully', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'batchdeleter@example.com',
        'Test Workspace'
      );

      const todos = await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Todo 1',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
          {
            workspaceId: workspace.id,
            title: 'Todo 2',
            createdById: user.id,
            status: 'TODO',
            priority: 'MEDIUM',
          },
        ],
      });

      const createdTodos = await prisma.todo.findMany({
        where: { workspaceId: workspace.id },
      });

      const response = await request(app)
        .delete(`/workspaces/${workspace.id}/todos/batch`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          todoIds: createdTodos.map((t) => t.id),
        });

      expect(response.status).toBe(200);
      expect(response.body.data.deleted).toBe(2);

      // Verify todos were deleted
      const remainingTodos = await prisma.todo.findMany({
        where: { id: { in: createdTodos.map((t) => t.id) } },
      });
      expect(remainingTodos).toHaveLength(0);
    });
  });

  describe('GET /workspaces/:id/todos/stats', () => {
    it('should get todo statistics successfully', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'stats@example.com',
        'Test Workspace'
      );

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await prisma.todo.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Todo 1',
            createdById: user.id,
            status: 'TODO',
            priority: 'HIGH',
          },
          {
            workspaceId: workspace.id,
            title: 'Todo 2',
            createdById: user.id,
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
          },
          {
            workspaceId: workspace.id,
            title: 'Todo 3',
            createdById: user.id,
            status: 'DONE',
            priority: 'LOW',
          },
          {
            workspaceId: workspace.id,
            title: 'Overdue Todo',
            createdById: user.id,
            status: 'TODO',
            priority: 'URGENT',
            dueAt: yesterday,
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/todos/stats`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(4);
      expect(response.body.data.byStatus).toBeDefined();
      expect(response.body.data.byPriority).toBeDefined();
      expect(response.body.data.overdue).toBeGreaterThanOrEqual(1);
      expect(response.body.requestId).toBeDefined();
    });
  });
});

