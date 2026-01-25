import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getTestPrismaClient, isDatabaseAvailable } from './helpers/db.js';
import { register as authRegister } from '../src/modules/auth/service.js';

// Mock OpenAI
vi.mock('../src/modules/ai/lib/openai.js', () => ({
  generateChatCompletion: vi.fn().mockResolvedValue('Mock AI response'),
  generateChatCompletionStream: vi.fn().mockImplementation(async function* () {
    yield 'Mocked';
    yield ' AI';
    yield ' response';
  }),
}));

describe('AI Chat API', () => {
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
      await prisma.chatMessage.deleteMany();
      await prisma.chatSession.deleteMany();
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
        members: {
          create: {
            userId: user.id,
            role: 'OWNER',
          },
        },
      },
    });

    return { user, workspace, accessToken };
  }

  // Helper function to create a todo
  async function createTodo(workspaceId: string, userId: string, accessToken: string) {
    const response = await request(app)
      .post(`/workspaces/${workspaceId}/todos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Test Todo',
        description: 'Test description',
        status: 'TODO',
        priority: 'MEDIUM',
      });

    return response.body.data;
  }

  describe('POST /ai/chat/task/:todoId', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app)
        .post('/ai/chat/task/test-todo-id')
        .send({ message: 'Hello' });

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent todo', async () => {
      if (!prisma) return;
      const { accessToken } = await createWorkspaceWithUser('test@example.com', 'Test Workspace');

      const response = await request(app)
        .post('/ai/chat/task/non-existent-todo-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Hello' });

      expect(response.status).toBe(404);
    });

    it('should return 403 if user not workspace member', async () => {
      if (!prisma) return;
      const { workspace, accessToken: ownerToken } = await createWorkspaceWithUser(
        'owner@example.com',
        'Test Workspace'
      );
      const { accessToken: memberToken } = await createWorkspaceWithUser(
        'member@example.com',
        'Other Workspace'
      );

      const todo = await createTodo(workspace.id, 'owner-id', ownerToken);

      const response = await request(app)
        .post(`/ai/chat/task/${todo.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ message: 'Hello' });

      expect(response.status).toBe(403);
    });

    it('should send message and receive AI response', async () => {
      if (!prisma) return;
      const { workspace, user, accessToken } = await createWorkspaceWithUser(
        'test@example.com',
        'Test Workspace'
      );

      const todo = await createTodo(workspace.id, user.id, accessToken);

      const response = await request(app)
        .post(`/ai/chat/task/${todo.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'What should I do with this task?' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('sessionId');
      expect(response.body.data.message).toHaveProperty('id');
      expect(response.body.data.message.role).toBe('assistant');
      expect(response.body.data.message.content).toBe('Mock AI response');
    });

    it('should validate message length', async () => {
      if (!prisma) return;
      const { workspace, user, accessToken } = await createWorkspaceWithUser(
        'test@example.com',
        'Test Workspace'
      );

      const todo = await createTodo(workspace.id, user.id, accessToken);

      const response = await request(app)
        .post(`/ai/chat/task/${todo.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: '' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /ai/chat/task/:todoId/history', () => {
    it('should return chat history', async () => {
      if (!prisma) return;
      const { workspace, user, accessToken } = await createWorkspaceWithUser(
        'test@example.com',
        'Test Workspace'
      );

      const todo = await createTodo(workspace.id, user.id, accessToken);

      // Send a message first
      await request(app)
        .post(`/ai/chat/task/${todo.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Hello' });

      const response = await request(app)
        .get(`/ai/chat/task/${todo.id}/history`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('sessionId');
      expect(response.body.data.chatType).toBe('TASK');
      expect(response.body.data.messages).toHaveLength(2); // user + assistant
    });

    it('should return empty messages array for new session', async () => {
      if (!prisma) return;
      const { workspace, user, accessToken } = await createWorkspaceWithUser(
        'test@example.com',
        'Test Workspace'
      );

      const todo = await createTodo(workspace.id, user.id, accessToken);

      const response = await request(app)
        .get(`/ai/chat/task/${todo.id}/history`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.messages).toEqual([]);
    });

    it('should support limit parameter', async () => {
      if (!prisma) return;
      const { workspace, user, accessToken } = await createWorkspaceWithUser(
        'test@example.com',
        'Test Workspace'
      );

      const todo = await createTodo(workspace.id, user.id, accessToken);

      const response = await request(app)
        .get(`/ai/chat/task/${todo.id}/history`)
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ limit: 10 });

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /ai/chat/task/:todoId', () => {
    it('should clear chat history', async () => {
      if (!prisma) return;
      const { workspace, user, accessToken } = await createWorkspaceWithUser(
        'test@example.com',
        'Test Workspace'
      );

      const todo = await createTodo(workspace.id, user.id, accessToken);

      // Send a message first
      await request(app)
        .post(`/ai/chat/task/${todo.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Hello' });

      const response = await request(app)
        .delete(`/ai/chat/task/${todo.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Chat history cleared');

      // Verify history is cleared
      const historyResponse = await request(app)
        .get(`/ai/chat/task/${todo.id}/history`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(historyResponse.body.data.messages).toEqual([]);
    });

    it('should return success even if no history', async () => {
      if (!prisma) return;
      const { workspace, user, accessToken } = await createWorkspaceWithUser(
        'test@example.com',
        'Test Workspace'
      );

      const todo = await createTodo(workspace.id, user.id, accessToken);

      const response = await request(app)
        .delete(`/ai/chat/task/${todo.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('POST /ai/chat/global', () => {
    it('should send message and receive AI response', async () => {
      if (!prisma) return;
      const { accessToken } = await createWorkspaceWithUser('test@example.com', 'Test Workspace');

      const response = await request(app)
        .post('/ai/chat/global')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'How can I be more productive?' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('sessionId');
      expect(response.body.data.message.role).toBe('assistant');
      expect(response.body.data.message.content).toBe('Mock AI response');
    });

    it('should include user context in system prompt', async () => {
      if (!prisma) return;
      const { accessToken } = await createWorkspaceWithUser('test@example.com', 'Test Workspace');

      const response = await request(app)
        .post('/ai/chat/global')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Tell me about my productivity' });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /ai/chat/global/history', () => {
    it('should return global chat history', async () => {
      if (!prisma) return;
      const { accessToken } = await createWorkspaceWithUser('test@example.com', 'Test Workspace');

      // Send a message first
      await request(app)
        .post('/ai/chat/global')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Hello' });

      const response = await request(app)
        .get('/ai/chat/global/history')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('sessionId');
      expect(response.body.data.chatType).toBe('GLOBAL');
      expect(response.body.data.messages).toHaveLength(2); // user + assistant
    });
  });

  describe('DELETE /ai/chat/global', () => {
    it('should clear global chat history', async () => {
      if (!prisma) return;
      const { accessToken } = await createWorkspaceWithUser('test@example.com', 'Test Workspace');

      // Send a message first
      await request(app)
        .post('/ai/chat/global')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Hello' });

      const response = await request(app)
        .delete('/ai/chat/global')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Chat history cleared');
    });
  });
});

