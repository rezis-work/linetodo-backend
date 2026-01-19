import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError } from './error.js';

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Missing or invalid authorization header') as AppError;
    error.statusCode = 401;
    return next(error);
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const payload = verifyAccessToken(token);

  if (!payload) {
    const error = new Error('Invalid or expired token') as AppError;
    error.statusCode = 401;
    return next(error);
  }

  // Attach user to request
  req.user = {
    id: payload.userId,
    email: payload.email,
  };

  next();
}

