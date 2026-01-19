import { prisma } from '../../lib/prisma.js';
import { hashRefreshToken } from '../../lib/jwt.js';
import { env } from '../../config/env.js';

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
 */
export async function createRefreshToken(
  userId: string,
  token: string
): Promise<{ id: string; tokenHash: string; expiresAt: Date }> {
  const tokenHash = hashRefreshToken(token);
  const expiresAt = getRefreshTokenExpiry();

  const refreshToken = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return refreshToken;
}

/**
 * Find a refresh token by hash
 */
export async function findRefreshToken(
  tokenHash: string
): Promise<{ id: string; userId: string; expiresAt: Date; revokedAt: Date | null } | null> {
  let token;
  try {
    token = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
  } catch {
    // Handle database connection errors by returning null
    return null;
  }

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
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await prisma.refreshToken.update({
    where: { tokenHash },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
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
 */
export async function rotateRefreshToken(
  oldTokenHash: string,
  newToken: string,
  userId: string
): Promise<{ id: string; tokenHash: string; expiresAt: Date }> {
  // Revoke old token
  await revokeRefreshToken(oldTokenHash);

  // Create new token
  return createRefreshToken(userId, newToken);
}

