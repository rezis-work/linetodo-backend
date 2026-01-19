import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../../lib/jwt.js';
import {
  createRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from './refreshToken.service.js';
import type { RegisterInput, LoginInput, AuthResponse, RefreshResponse } from './types.js';

/**
 * Register a new user
 */
export async function register(
  input: RegisterInput
): Promise<AuthResponse> {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    const error = new Error('User with this email already exists') as Error & {
      statusCode: number;
    };
    error.statusCode = 409;
    throw error;
  }

  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Create user and refresh token in transaction
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
      },
    });

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken();

    // Create refresh token using transaction client
    await createRefreshToken(user.id, refreshToken, tx);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken,
    };
  });

  return result;
}

/**
 * Login user
 */
export async function login(input: LoginInput): Promise<AuthResponse> {
  // Find user
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email: input.email },
    });
  } catch (error) {
    // Handle database connection errors
    const dbError = new Error('Invalid email or password') as Error & {
      statusCode: number;
    };
    dbError.statusCode = 401;
    throw dbError;
  }

  if (!user) {
    const error = new Error('Invalid email or password') as Error & {
      statusCode: number;
    };
    error.statusCode = 401;
    throw error;
  }

  // Verify password
  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    const error = new Error('Invalid email or password') as Error & {
      statusCode: number;
    };
    error.statusCode = 401;
    throw error;
  }

  // Generate tokens
  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken();

  // Create refresh token
  try {
    await createRefreshToken(user.id, refreshToken);
  } catch (error) {
    // Handle errors from createRefreshToken
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    // Convert unexpected errors to 500
    const unexpectedError = new Error('Failed to create refresh token') as Error & {
      statusCode: number;
    };
    unexpectedError.statusCode = 500;
    throw unexpectedError;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Refresh access token with rotation
 */
export async function refresh(input: {
  refreshToken: string;
}): Promise<RefreshResponse> {
  // Hash the provided refresh token
  const tokenHash = hashRefreshToken(input.refreshToken);

  // Find refresh token
  let refreshTokenRecord;
  try {
    refreshTokenRecord = await findRefreshToken(tokenHash);
  } catch (error) {
    // Handle database errors by treating as invalid token
    const dbError = new Error('Invalid or expired refresh token') as Error & {
      statusCode: number;
    };
    dbError.statusCode = 401;
    throw dbError;
  }

  if (!refreshTokenRecord) {
    const error = new Error('Invalid or expired refresh token') as Error & {
      statusCode: number;
    };
    error.statusCode = 401;
    throw error;
  }

  // Get user
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: refreshTokenRecord.userId },
    });
  } catch (error) {
    // Handle database errors
    const dbError = new Error('Invalid or expired refresh token') as Error & {
      statusCode: number;
    };
    dbError.statusCode = 401;
    throw dbError;
  }

  if (!user) {
    const error = new Error('User not found') as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }

  // Generate new tokens
  const newAccessToken = generateAccessToken(user.id, user.email);
  const newRefreshToken = generateRefreshToken();

  // Rotate refresh token (revoke old, create new)
  await rotateRefreshToken(tokenHash, newRefreshToken, user.id);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Logout user (revoke refresh token)
 */
export async function logout(input: { refreshToken: string }): Promise<void> {
  const tokenHash = hashRefreshToken(input.refreshToken);
  await revokeRefreshToken(tokenHash);
}

/**
 * Get current user by ID
 */
export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return user;
}

