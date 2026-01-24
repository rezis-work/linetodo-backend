import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getTestPrismaClient, isDatabaseAvailable } from './helpers/db.js';
import { register as authRegister } from '../src/modules/auth/service.js';

describe('Calendar API', () => {
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
      await prisma.calendarEvent.deleteMany();
      await prisma.todo.deleteMany();
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

  describe('POST /workspaces/:id/calendar', () => {
    it('should create a calendar event successfully', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'creator@example.com',
        'Test Workspace'
      );

      const startAt = new Date();
      startAt.setHours(10, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(11, 0, 0, 0);

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/calendar`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Test Event',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.title).toBe('Test Event');
      expect(response.body.data.workspaceId).toBe(workspace.id);
      expect(response.body.requestId).toBeDefined();

      // Verify event was created in database
      const event = await prisma.calendarEvent.findUnique({
        where: { id: response.body.data.id },
      });
      expect(event).toBeDefined();
      expect(event?.title).toBe('Test Event');
    });

    it('should create a calendar event with linked todo', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'creator2@example.com',
        'Test Workspace 2'
      );

      // Create a todo first
      const todo = await prisma.todo.create({
        data: {
          workspaceId: workspace.id,
          title: 'Test Todo',
          createdById: user.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      const startAt = new Date();
      startAt.setHours(10, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(11, 0, 0, 0);

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/calendar`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Event Linked to Todo',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          relatedTodoId: todo.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.relatedTodoId).toBe(todo.id);
      expect(response.body.data.relatedTodo).toBeDefined();
      expect(response.body.data.relatedTodo.id).toBe(todo.id);
    });

    it('should reject event creation for non-member', async () => {
      if (!prisma) {
        return;
      }

      const { workspace } = await createWorkspaceWithUser(
        'owner@example.com',
        'Test Workspace'
      );

      const { accessToken: outsiderToken } = await authRegister({
        email: 'outsider@example.com',
        password: 'password123',
      });

      const startAt = new Date();
      startAt.setHours(10, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(11, 0, 0, 0);

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/calendar`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({
          title: 'Test Event',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
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

      const startAt = new Date();
      startAt.setHours(10, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(11, 0, 0, 0);

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/calendar`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: '',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Title is required');
    });

    it('should validate end date is after start date', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'validator2@example.com',
        'Test Workspace'
      );

      const startAt = new Date();
      startAt.setHours(11, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(10, 0, 0, 0); // End before start

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/calendar`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Test Event',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('End date must be after or equal to start date');
    });

    it('should validate todo belongs to workspace', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'validator3@example.com',
        'Test Workspace'
      );

      const { workspace: otherWorkspace } = await createWorkspaceWithUser(
        'other@example.com',
        'Other Workspace'
      );

      const { user: otherUser } = await authRegister({
        email: 'otheruser@example.com',
        password: 'password123',
      });

      // Create todo in other workspace
      const todo = await prisma.todo.create({
        data: {
          workspaceId: otherWorkspace.id,
          title: 'Other Todo',
          createdById: otherUser.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      const startAt = new Date();
      startAt.setHours(10, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(11, 0, 0, 0);

      const response = await request(app)
        .post(`/workspaces/${workspace.id}/calendar`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Test Event',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          relatedTodoId: todo.id,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Todo not found in this workspace');
    });
  });

  describe('GET /workspaces/:id/calendar', () => {
    it('should list calendar events', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'lister@example.com',
        'Test Workspace'
      );

      const startAt1 = new Date();
      startAt1.setHours(10, 0, 0, 0);
      const endAt1 = new Date(startAt1);
      endAt1.setHours(11, 0, 0, 0);

      const startAt2 = new Date();
      startAt2.setHours(14, 0, 0, 0);
      const endAt2 = new Date(startAt2);
      endAt2.setHours(15, 0, 0, 0);

      await prisma.calendarEvent.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Event 1',
            startAt: startAt1,
            endAt: endAt1,
          },
          {
            workspaceId: workspace.id,
            title: 'Event 2',
            startAt: startAt2,
            endAt: endAt2,
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/calendar`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.events).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
    });

    it('should filter events by date range', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'filterer@example.com',
        'Test Workspace'
      );

      const today = new Date();
      today.setHours(10, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(10, 0, 0, 0);

      await prisma.calendarEvent.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Today Event',
            startAt: today,
            endAt: new Date(today.getTime() + 3600000),
          },
          {
            workspaceId: workspace.id,
            title: 'Tomorrow Event',
            startAt: tomorrow,
            endAt: new Date(tomorrow.getTime() + 3600000),
          },
          {
            workspaceId: workspace.id,
            title: 'Next Week Event',
            startAt: nextWeek,
            endAt: new Date(nextWeek.getTime() + 3600000),
          },
        ],
      });

      const startAfter = new Date(today);
      startAfter.setDate(startAfter.getDate() + 1);
      startAfter.setHours(0, 0, 0, 0);

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/calendar`)
        .query({ startAfter: startAfter.toISOString() })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.events.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.events.every((e: any) => new Date(e.startAt) >= startAfter)).toBe(true);
    });

    it('should filter events by search query', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'searcher@example.com',
        'Test Workspace'
      );

      const startAt = new Date();
      startAt.setHours(10, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(11, 0, 0, 0);

      await prisma.calendarEvent.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Important Meeting',
            startAt,
            endAt,
          },
          {
            workspaceId: workspace.id,
            title: 'Regular Task',
            startAt,
            endAt,
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/calendar`)
        .query({ search: 'Important' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.events).toHaveLength(1);
      expect(response.body.data.events[0].title).toContain('Important');
    });

    it('should sort events by start date', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'sorter@example.com',
        'Test Workspace'
      );

      const baseDate = new Date();
      baseDate.setHours(10, 0, 0, 0);

      await prisma.calendarEvent.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Event 3',
            startAt: new Date(baseDate.getTime() + 7200000), // 2 hours later
            endAt: new Date(baseDate.getTime() + 10800000),
          },
          {
            workspaceId: workspace.id,
            title: 'Event 1',
            startAt: baseDate,
            endAt: new Date(baseDate.getTime() + 3600000),
          },
          {
            workspaceId: workspace.id,
            title: 'Event 2',
            startAt: new Date(baseDate.getTime() + 3600000), // 1 hour later
            endAt: new Date(baseDate.getTime() + 7200000),
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/calendar`)
        .query({ sortBy: 'startAt', sortOrder: 'asc' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.events.length).toBe(3);
      const events = response.body.data.events;
      expect(new Date(events[0].startAt).getTime()).toBeLessThanOrEqual(
        new Date(events[1].startAt).getTime()
      );
      expect(new Date(events[1].startAt).getTime()).toBeLessThanOrEqual(
        new Date(events[2].startAt).getTime()
      );
    });
  });

  describe('GET /workspaces/:id/calendar/:eventId', () => {
    it('should get a single calendar event', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'getter@example.com',
        'Test Workspace'
      );

      const startAt = new Date();
      startAt.setHours(10, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(11, 0, 0, 0);

      const event = await prisma.calendarEvent.create({
        data: {
          workspaceId: workspace.id,
          title: 'Test Event',
          startAt,
          endAt,
        },
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/calendar/${event.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(event.id);
      expect(response.body.data.title).toBe('Test Event');
    });

    it('should return 404 for non-existent event', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'getter2@example.com',
        'Test Workspace'
      );

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/calendar/clx123456789012345678901234`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
    });

    it('should return 404 for event in different workspace', async () => {
      if (!prisma) {
        return;
      }

      const { workspace } = await createWorkspaceWithUser(
        'owner@example.com',
        'Test Workspace'
      );

      const { workspace: otherWorkspace, accessToken } = await createWorkspaceWithUser(
        'other@example.com',
        'Other Workspace'
      );

      const startAt = new Date();
      startAt.setHours(10, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(11, 0, 0, 0);

      const event = await prisma.calendarEvent.create({
        data: {
          workspaceId: workspace.id,
          title: 'Other Event',
          startAt,
          endAt,
        },
      });

      const response = await request(app)
        .get(`/workspaces/${otherWorkspace.id}/calendar/${event.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('PATCH /workspaces/:id/calendar/:eventId', () => {
    it('should update a calendar event', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'updater@example.com',
        'Test Workspace'
      );

      const startAt = new Date();
      startAt.setHours(10, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(11, 0, 0, 0);

      const event = await prisma.calendarEvent.create({
        data: {
          workspaceId: workspace.id,
          title: 'Original Title',
          startAt,
          endAt,
        },
      });

      const newStartAt = new Date(startAt);
      newStartAt.setHours(14, 0, 0, 0);
      const newEndAt = new Date(newStartAt);
      newEndAt.setHours(15, 0, 0, 0);

      const response = await request(app)
        .patch(`/workspaces/${workspace.id}/calendar/${event.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Updated Title',
          startAt: newStartAt.toISOString(),
          endAt: newEndAt.toISOString(),
        });

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe('Updated Title');

      // Verify update in database
      const updatedEvent = await prisma.calendarEvent.findUnique({
        where: { id: event.id },
      });
      expect(updatedEvent?.title).toBe('Updated Title');
    });

    it('should validate end date is after start date on update', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'updater2@example.com',
        'Test Workspace'
      );

      const startAt = new Date();
      startAt.setHours(10, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(11, 0, 0, 0);

      const event = await prisma.calendarEvent.create({
        data: {
          workspaceId: workspace.id,
          title: 'Test Event',
          startAt,
          endAt,
        },
      });

      const newStartAt = new Date();
      newStartAt.setHours(11, 0, 0, 0);
      const newEndAt = new Date(newStartAt);
      newEndAt.setHours(10, 0, 0, 0); // End before start

      const response = await request(app)
        .patch(`/workspaces/${workspace.id}/calendar/${event.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          startAt: newStartAt.toISOString(),
          endAt: newEndAt.toISOString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('End date must be after or equal to start date');
    });
  });

  describe('DELETE /workspaces/:id/calendar/:eventId', () => {
    it('should delete a calendar event', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'deleter@example.com',
        'Test Workspace'
      );

      const startAt = new Date();
      startAt.setHours(10, 0, 0, 0);
      const endAt = new Date(startAt);
      endAt.setHours(11, 0, 0, 0);

      const event = await prisma.calendarEvent.create({
        data: {
          workspaceId: workspace.id,
          title: 'To Delete',
          startAt,
          endAt,
        },
      });

      const response = await request(app)
        .delete(`/workspaces/${workspace.id}/calendar/${event.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted successfully');

      // Verify deletion
      const deletedEvent = await prisma.calendarEvent.findUnique({
        where: { id: event.id },
      });
      expect(deletedEvent).toBeNull();
    });

    it('should return 404 for non-existent event', async () => {
      if (!prisma) {
        return;
      }

      const { workspace, accessToken } = await createWorkspaceWithUser(
        'deleter2@example.com',
        'Test Workspace'
      );

      const response = await request(app)
        .delete(`/workspaces/${workspace.id}/calendar/clx123456789012345678901234`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /workspaces/:id/calendar/stats', () => {
    it('should get calendar statistics', async () => {
      if (!prisma) {
        return;
      }

      const { user, workspace, accessToken } = await createWorkspaceWithUser(
        'stats@example.com',
        'Test Workspace'
      );

      const today = new Date();
      today.setHours(10, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(10, 0, 0, 0);

      const todo = await prisma.todo.create({
        data: {
          workspaceId: workspace.id,
          title: 'Test Todo',
          createdById: user.id,
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      await prisma.calendarEvent.createMany({
        data: [
          {
            workspaceId: workspace.id,
            title: 'Today Event',
            startAt: today,
            endAt: new Date(today.getTime() + 3600000),
          },
          {
            workspaceId: workspace.id,
            title: 'Tomorrow Event',
            startAt: tomorrow,
            endAt: new Date(tomorrow.getTime() + 3600000),
          },
          {
            workspaceId: workspace.id,
            title: 'Linked Event',
            startAt: nextWeek,
            endAt: new Date(nextWeek.getTime() + 3600000),
            relatedTodoId: todo.id,
          },
        ],
      });

      const response = await request(app)
        .get(`/workspaces/${workspace.id}/calendar/stats`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(3);
      expect(response.body.data.todayCount).toBeGreaterThanOrEqual(1);
      expect(response.body.data.thisWeekCount).toBeGreaterThanOrEqual(2);
      expect(response.body.data.thisMonthCount).toBeGreaterThanOrEqual(3);
      expect(response.body.data.linkedToTodos).toBe(1);
    });
  });
});

