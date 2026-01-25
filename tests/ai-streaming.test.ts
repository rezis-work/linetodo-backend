import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getTestPrismaClient, isDatabaseAvailable } from './helpers/db.js';
import { register as authRegister } from '../src/modules/auth/service.js';

// Mock OpenAI streaming
vi.mock('../src/modules/ai/lib/openai.js', () => ({
  generateChatCompletion: vi.fn().mockResolvedValue('Mocked AI response'),
  generateChatCompletionStream: vi.fn().mockImplementation(async function* () {
    yield 'Hello';
    yield ' ';
    yield 'World';
    yield '!';
  }),
}));

describe('AI Chat Streaming API', () => {
  const app = createApp();
  let prisma: ReturnType<typeof getTestPrismaClient> | null = null;
  let testCounter = 0;

  beforeAll(async () => {
    if (await isDatabaseAvailable()) {
      prisma = getTestPrismaClient();
    }
  });

  beforeEach(async () => {
    if (!prisma) {
      return;
    }

    // Clean up before each test - handle missing tables gracefully
    const cleanupOperations = [
      () => prisma.chatMessage.deleteMany().catch(() => {}),
      () => prisma.chatSession.deleteMany().catch(() => {}),
      () => prisma.refreshToken.deleteMany().catch(() => {}),
      () => prisma.todoComment.deleteMany().catch(() => {}),
      () => prisma.calendarEvent.deleteMany().catch(() => {}),
      () => prisma.todo.deleteMany().catch(() => {}),
      () => prisma.workspaceMember.deleteMany().catch(() => {}),
      () => prisma.workspace.deleteMany().catch(() => {}),
      () => prisma.embeddingItem.deleteMany().catch(() => {}),
      () => prisma.user.deleteMany().catch(() => {}),
    ];

    // Execute all cleanup operations, ignoring errors
    await Promise.all(cleanupOperations.map((op) => op()));
  });

  // Helper function to generate unique email
  function generateUniqueEmail(base: string): string {
    testCounter++;
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const [localPart, domain] = base.split('@');
    return `${localPart}+${testCounter}-${timestamp}-${random}@${domain}`;
  }

  // Helper function to create a workspace and return workspace + user + token
  async function createWorkspaceWithUser(email: string, workspaceName: string) {
    if (!prisma) {
      throw new Error('Prisma not available');
    }

    const uniqueEmail = generateUniqueEmail(email);
    const { user, accessToken } = await authRegister({
      email: uniqueEmail,
      password: 'password123',
      name: uniqueEmail.split('@')[0],
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

  describe('POST /ai/chat/task/:todoId/stream', () => {
    it('should return 401 when not authenticated', async () => {
      if (!prisma) return;
      const { workspace, user, accessToken } = await createWorkspaceWithUser(
        'test@example.com',
        'Test Workspace'
      );
      const todo = await createTodo(workspace.id, user.id, accessToken);

      const response = await request(app)
        .post(`/ai/chat/task/${todo.id}/stream`)
        .send({ message: 'Hello' });

      expect(response.status).toBe(401);
    });

    it('should return SSE stream for valid request', async () => {
      if (!prisma) return;
      const { workspace, user, accessToken } = await createWorkspaceWithUser(
        'test@example.com',
        'Test Workspace'
      );
      const todo = await createTodo(workspace.id, user.id, accessToken);

      const response = await request(app)
        .post(`/ai/chat/task/${todo.id}/stream`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Hello AI' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');

      // Parse SSE events from response
      const events = response.text
        .split('\n\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.replace('data: ', '')));

      // Should have start, tokens, and done events
      expect(events.find((e) => e.type === 'start')).toBeTruthy();
      expect(events.find((e) => e.type === 'done')).toBeTruthy();

      // Should have token events
      const tokenEvents = events.filter((e) => e.type === 'token');
      expect(tokenEvents.length).toBeGreaterThan(0);
    });

    it('should save messages to database after streaming', async () => {
      if (!prisma) return;
      const { workspace, user, accessToken } = await createWorkspaceWithUser(
        'test@example.com',
        'Test Workspace'
      );
      const todo = await createTodo(workspace.id, user.id, accessToken);

      await request(app)
        .post(`/ai/chat/task/${todo.id}/stream`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Test message' });

      // Check messages were saved
      const session = await prisma.chatSession.findFirst({
        where: { userId: user.id, todoId: todo.id, chatType: 'TASK' },
        include: { messages: true },
      });

      expect(session).toBeTruthy();
      expect(session?.messages.length).toBe(2); // User message + AI response
      expect(session?.messages[0].role).toBe('user');
      expect(session?.messages[1].role).toBe('assistant');
    });

    it('should return 400 for invalid todo ID', async () => {
      if (!prisma) return;
      const { accessToken } = await createWorkspaceWithUser('test@example.com', 'Test Workspace');

      const response = await request(app)
        .post('/ai/chat/task/invalid-id/stream')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Hello' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /ai/chat/global/stream', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app)
        .post('/ai/chat/global/stream')
        .send({ message: 'Hello' });

      expect(response.status).toBe(401);
    });

    it('should return SSE stream for valid request', async () => {
      if (!prisma) return;
      const { accessToken } = await createWorkspaceWithUser('test@example.com', 'Test Workspace');

      const response = await request(app)
        .post('/ai/chat/global/stream')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Hello AI' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');

      // Parse SSE events from response
      const events = response.text
        .split('\n\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.replace('data: ', '')));

      // Should have start, tokens, and done events
      expect(events.find((e) => e.type === 'start')).toBeTruthy();
      expect(events.find((e) => e.type === 'done')).toBeTruthy();
    });

    it('should save messages to database after streaming', async () => {
      if (!prisma) return;
      const { user, accessToken } = await createWorkspaceWithUser(
        'test@example.com',
        'Test Workspace'
      );

      await request(app)
        .post('/ai/chat/global/stream')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Global test message' });

      // Check messages were saved
      const session = await prisma.chatSession.findFirst({
        where: { userId: user.id, chatType: 'GLOBAL' },
        include: { messages: true },
      });

      expect(session).toBeTruthy();
      expect(session?.messages.length).toBe(2);
    });

    it('should return 400 for empty message', async () => {
      if (!prisma) return;
      const { accessToken } = await createWorkspaceWithUser('test@example.com', 'Test Workspace');

      const response = await request(app)
        .post('/ai/chat/global/stream')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: '' });

      expect(response.status).toBe(400);
    });
  });
});

