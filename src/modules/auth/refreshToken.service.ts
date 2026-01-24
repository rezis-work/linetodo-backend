import { prisma } from '../../lib/prisma.js';
import { hashRefreshToken } from '../../lib/jwt.js';
import { env } from '../../config/env.js';
import type { Prisma } from '@prisma/client';

/**
 * Calculate refresh token expiry date
 */
function getRefreshTokenExpiry(): Date {
  const expiry = env.JWT_REFRESH_TOKEN_EXPIRY;
  const now = new Date();

  if (expiry.endsWith('d')) {
    const days = parseInt(expiry.slice(0, -1), 10);
    now.setDate(now.getDate() + days);
  } else if (expiry.endsWith('h')) {
    const hours = parseInt(expiry.slice(0, -1), 10);
    now.setHours(now.getHours() + hours);
  } else {
    // Default to 30 days
    now.setDate(now.getDate() + 30);
  }

  return now;
}

/**
 * Create a new refresh token
 * @param userId - User ID
 * @param token - Refresh token string
 * @param tx - Optional transaction client (for use within transactions)
 */
export async function createRefreshToken(
  userId: string,
  token: string,
  tx?: Prisma.TransactionClient
): Promise<{ id: string; tokenHash: string; expiresAt: Date }> {
  const tokenHash = hashRefreshToken(token);
  const expiresAt = getRefreshTokenExpiry();

  const client = tx || prisma;
  try {
    const refreshToken = await client.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return refreshToken;
  } catch (error) {
    // Handle foreign key constraint violations (user doesn't exist)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2003'
    ) {
      const fkError = new Error('User not found') as Error & {
        statusCode: number;
      };
      fkError.statusCode = 404;
      throw fkError;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Find a refresh token by hash
 */
export async function findRefreshToken(
  tokenHash: string
): Promise<{ id: string; userId: string; expiresAt: Date; revokedAt: Date | null } | null> {
  try {
    const token = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!token) {
      return null;
    }

    // Check if token is expired
    if (token.expiresAt < new Date()) {
      return null;
    }

    // Check if token is revoked
    if (token.revokedAt) {
      return null;
    }

    return token;
  } catch (error) {
    // Only catch database connection errors, let other errors propagate
    // Check if it's a connection/query error vs a constraint error
    if (error && typeof error === 'object' && 'code' in error) {
      const dbError = error as { code?: string };
      // PostgreSQL connection errors
      if (dbError.code === 'ECONNREFUSED' || dbError.code === 'ETIMEDOUT' || dbError.code === 'ENOTFOUND') {
        return null;
      }
    }
    // Re-throw other errors (like constraint violations) to be handled by caller
    throw error;
  }
}

/**
 * Revoke a refresh token
 * @param tokenHash - Token hash to revoke
 * @param tx - Optional transaction client (for use within transactions)
 */
export async function revokeRefreshToken(
  tokenHash: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;
  // Use updateMany to avoid error if token doesn't exist
  await client.refreshToken.updateMany({
    where: { 
      tokenHash,
      revokedAt: null, // Only revoke if not already revoked
    },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke all refresh tokens for a user
 * @param userId - User ID
 * @param tx - Optional transaction client (for use within transactions)
 */
export async function revokeAllUserTokens(
  userId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;
  await client.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

/**
 * Rotate refresh token: revoke old, create new
 * This operation is atomic - both revoke and create happen in a transaction
 */
export async function rotateRefreshToken(
  oldTokenHash: string,
  newToken: string,
  userId: string
): Promise<{ id: string; tokenHash: string; expiresAt: Date }> {
  // Perform rotation atomically in a transaction
  return await prisma.$transaction(async (tx) => {
    // Revoke old token
    await revokeRefreshToken(oldTokenHash, tx);

    // Create new token
    return createRefreshToken(userId, newToken, tx);
  });
}

