import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getTestPrismaClient, isDatabaseAvailable } from './helpers/db.js';
import { hashPassword } from '../src/lib/password.js';
import { generateAccessToken, hashRefreshToken } from '../src/lib/jwt.js';
import { env } from '../src/config/env.js';

describe('Auth API', () => {
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
      await prisma.user.deleteMany();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      if (!prisma) {
        return;
      }

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'password123',
          name: 'New User',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe('newuser@example.com');
      expect(response.body.data.user.name).toBe('New User');
      expect(response.body.requestId).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      if (!prisma) {
        return;
      }

      // Create user first
      const passwordHash = await hashPassword('password123');
      await prisma.user.create({
        data: {
          email: 'existing@example.com',
          passwordHash,
        },
      });

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('already exists');
      expect(response.body.error.requestId).toBeDefined();
    });

    it('should validate input (invalid email)', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Validation error');
      expect(response.body.error.requestId).toBeDefined();
    });

    it('should validate input (short password)', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'user@example.com',
          password: 'short',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Validation error');
    });
  });

  describe('POST /auth/login', () => {
    it('should login successfully', async () => {
      if (!prisma) {
        return;
      }

      // Create user
      const passwordHash = await hashPassword('password123');
      const user = await prisma.user.create({
        data: {
          email: 'login@example.com',
          passwordHash,
          name: 'Login User',
        },
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'login@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.id).toBe(user.id);
      expect(response.body.requestId).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      if (!prisma) {
        return;
      }

      // Create user
      const passwordHash = await hashPassword('password123');
      await prisma.user.create({
        data: {
          email: 'user@example.com',
          passwordHash,
        },
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'user@example.com',
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Invalid email or password');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Invalid email or password');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh token successfully with rotation', async () => {
      if (!prisma) {
        return;
      }

      // Create user and refresh token
      const passwordHash = await hashPassword('password123');
      const user = await prisma.user.create({
        data: {
          email: 'refresh@example.com',
          passwordHash,
        },
      });

      const refreshToken = 'test-refresh-token-123';
      const tokenHash = hashRefreshToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Use the service function to create refresh token to ensure consistency
      const { createRefreshToken } = await import('../src/modules/auth/refreshToken.service.js');
      await createRefreshToken(user.id, refreshToken);

      const response = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.refreshToken).not.toBe(refreshToken); // Should be rotated

      // Verify old token is revoked
      const oldToken = await prisma.refreshToken.findUnique({
        where: { tokenHash },
      });
      expect(oldToken?.revokedAt).toBeDefined();

      // Verify new token exists
      const newTokenHash = hashRefreshToken(response.body.data.refreshToken);
      const newToken = await prisma.refreshToken.findUnique({
        where: { tokenHash: newTokenHash },
      });
      expect(newToken).toBeDefined();
      expect(newToken?.revokedAt).toBeNull();
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken: 'invalid-token',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Invalid or expired');
    });

    it('should reject revoked refresh token', async () => {
      if (!prisma) {
        return;
      }

      // Create user and revoked token
      const passwordHash = await hashPassword('password123');
      const user = await prisma.user.create({
        data: {
          email: 'revoked@example.com',
          passwordHash,
        },
      });

      const refreshToken = 'revoked-token-123';
      const tokenHash = hashRefreshToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Create token first, then revoke it
      const { createRefreshToken, revokeRefreshToken } = await import('../src/modules/auth/refreshToken.service.js');
      await createRefreshToken(user.id, refreshToken);
      await revokeRefreshToken(tokenHash);

      const response = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      if (!prisma) {
        return;
      }

      // Create user and refresh token
      const passwordHash = await hashPassword('password123');
      const user = await prisma.user.create({
        data: {
          email: 'logout@example.com',
          passwordHash,
        },
      });

      const refreshToken = 'logout-token-123';
      const tokenHash = hashRefreshToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      const response = await request(app)
        .post('/auth/logout')
        .send({
          refreshToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Logged out successfully');

      // Verify token is revoked
      const token = await prisma.refreshToken.findUnique({
        where: { tokenHash },
      });
      expect(token?.revokedAt).toBeDefined();
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user with valid token', async () => {
      if (!prisma) {
        return;
      }

      // Create user
      const passwordHash = await hashPassword('password123');
      const user = await prisma.user.create({
        data: {
          email: 'me@example.com',
          passwordHash,
          name: 'Me User',
        },
      });

      const accessToken = generateAccessToken(user.id, user.email);

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(user.id);
      expect(response.body.data.email).toBe(user.email);
      expect(response.body.requestId).toBeDefined();
    });

    it('should reject request without token', async () => {
      const response = await request(app).get('/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Missing or invalid');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Invalid or expired');
    });

    it('should reject request with malformed authorization header', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Refresh Token Rotation', () => {
    it('should invalidate old token after refresh', async () => {
      if (!prisma) {
        return;
      }

      // Create user and refresh token
      const passwordHash = await hashPassword('password123');
      const user = await prisma.user.create({
        data: {
          email: 'rotation@example.com',
          passwordHash,
        },
      });

      const oldRefreshToken = 'rotation-token-old';
      const oldTokenHash = hashRefreshToken(oldRefreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: oldTokenHash,
          expiresAt,
        },
      });

      // Refresh token
      const refreshResponse = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken: oldRefreshToken,
        });

      expect(refreshResponse.status).toBe(200);
      const newRefreshToken = refreshResponse.body.data.refreshToken;

      // Try to use old token - should fail
      const oldTokenResponse = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken: oldRefreshToken,
        });

      expect(oldTokenResponse.status).toBe(401);

      // Try to use new token - should succeed
      const newTokenResponse = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken: newRefreshToken,
        });

      expect(newTokenResponse.status).toBe(200);
    });
  });
});

