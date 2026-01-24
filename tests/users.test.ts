import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getTestPrismaClient, isDatabaseAvailable } from './helpers/db.js';
import { register as authRegister } from '../src/modules/auth/service.js';

describe('Users API', () => {
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

  // Helper function to create a user and return user + token
  async function createUser(email: string) {
    const { user, accessToken, refreshToken } = await authRegister({
      email,
      password: 'password123',
      name: email.split('@')[0],
    });

    return { user, accessToken, refreshToken };
  }

  describe('GET /users/me', () => {
    it('should return user profile successfully', async () => {
      if (!prisma) return;
      const { user, accessToken } = await createUser('profile@example.com');

      const response = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe(user.email);
      expect(response.body.data.name).toBe(user.name);
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
      expect(response.body.data).toHaveProperty('workspaceCount');
      expect(response.body.data.workspaceCount).toBe(0);
      expect(response.body.requestId).toBeDefined();
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app).get('/users/me');

      expect(response.status).toBe(401);
    });

    it('should include correct workspace count', async () => {
      if (!prisma) return;
      const { user, accessToken } = await createUser('workspacecount@example.com');

      // Create workspaces for the user
      const workspace1 = await prisma.workspace.create({
        data: {
          name: 'Workspace 1',
          ownerId: user.id,
        },
      });

      const workspace2 = await prisma.workspace.create({
        data: {
          name: 'Workspace 2',
          ownerId: user.id,
        },
      });

      await prisma.workspaceMember.createMany({
        data: [
          {
            workspaceId: workspace1.id,
            userId: user.id,
            role: 'OWNER',
          },
          {
            workspaceId: workspace2.id,
            userId: user.id,
            role: 'OWNER',
          },
        ],
      });

      const response = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.workspaceCount).toBe(2);
    });
  });

  describe('PATCH /users/me', () => {
    it('should update name successfully', async () => {
      if (!prisma) return;
      const { user, accessToken } = await createUser('updatename@example.com');

      const newName = 'Updated Name';
      const response = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: newName });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe(newName);
      expect(response.body.data.email).toBe(user.email);
      expect(response.body.data.id).toBe(user.id);

      // Verify update in database
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.name).toBe(newName);
    });

    it('should validate name length (min 1)', async () => {
      if (!prisma) return;
      const { accessToken } = await createUser('validatename1@example.com');

      const response = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('at least 1 character');
    });

    it('should validate name length (max 100)', async () => {
      if (!prisma) return;
      const { accessToken } = await createUser('validatename2@example.com');

      const longName = 'a'.repeat(101);
      const response = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: longName });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('100 characters or less');
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .patch('/users/me')
        .send({ name: 'New Name' });

      expect(response.status).toBe(401);
    });

    it('should trim whitespace from name', async () => {
      if (!prisma) return;
      const { user, accessToken } = await createUser('trimname@example.com');

      const response = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '  Trimmed Name  ' });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Trimmed Name');
    });
  });

  describe('PATCH /users/me/password', () => {
    it('should change password successfully', async () => {
      if (!prisma) return;
      const { user, accessToken } = await createUser('changepassword@example.com');

      const response = await request(app)
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password changed successfully');
      expect(response.body.requestId).toBeDefined();

      // Verify password was changed by trying to login with new password
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: user.email,
          password: 'newpassword456',
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.data).toHaveProperty('accessToken');
    });

    it('should return 400 for incorrect current password', async () => {
      if (!prisma) return;
      const { accessToken } = await createUser('wrongpassword@example.com');

      const response = await request(app)
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword456',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Current password is incorrect');
    });

    it('should validate new password minimum length (8 chars)', async () => {
      if (!prisma) return;
      const { accessToken } = await createUser('shortpassword@example.com');

      const response = await request(app)
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'short',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('at least 8 characters');
    });

    it('should validate new password maximum length (128 chars)', async () => {
      if (!prisma) return;
      const { accessToken } = await createUser('longpassword@example.com');

      const longPassword = 'a'.repeat(129);
      const response = await request(app)
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: longPassword,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('128 characters or less');
    });

    it('should revoke refresh tokens after password change', async () => {
      if (!prisma) return;
      const { user, accessToken, refreshToken } = await createUser('revoketokens@example.com');

      // Verify refresh token exists before password change
      const tokenBefore = await prisma.refreshToken.findFirst({
        where: { userId: user.id, revokedAt: null },
      });
      expect(tokenBefore).toBeTruthy();

      // Change password
      const response = await request(app)
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        });

      expect(response.status).toBe(200);

      // Verify all refresh tokens are revoked
      const tokensAfter = await prisma.refreshToken.findMany({
        where: { userId: user.id, revokedAt: null },
      });
      expect(tokensAfter).toHaveLength(0);

      // Verify old refresh token is revoked
      const oldToken = await prisma.refreshToken.findFirst({
        where: { userId: user.id },
      });
      expect(oldToken?.revokedAt).toBeTruthy();

      // Verify refresh token endpoint rejects revoked token
      const refreshResponse = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(refreshResponse.status).toBe(401);
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .patch('/users/me/password')
        .send({
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        });

      expect(response.status).toBe(401);
    });
  });
});

