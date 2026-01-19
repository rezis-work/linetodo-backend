import jwt, { type JwtPayload, type Secret, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import crypto from 'crypto';

export interface TokenPayload {
  userId: string;
  email: string;
}

function getJwtSecret(): Secret {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set');
  }
  return env.JWT_SECRET;
}

/**
 * Generate a JWT access token
 */
export function generateAccessToken(userId: string, email: string): string {
  const payload: TokenPayload = { userId, email };
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_TOKEN_EXPIRY as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, getJwtSecret(), options);
}

/**
 * Verify and decode a JWT access token
 */
export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded || typeof decoded === 'string') {
      return null;
    }
    const payload = decoded as JwtPayload & Partial<TokenPayload>;
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') {
      return null;
    }
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

/**
 * Generate a random refresh token string
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a refresh token for storage
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

