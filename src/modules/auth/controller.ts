import { Request, Response, NextFunction } from 'express';
import { register, login, refresh, logout, getCurrentUser } from './service.js';
import { AppError } from '../../middleware/error.js';

/**
 * Register handler
 */
export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Body already validated by validateBody middleware
    const result = await register(req.body);

    res.status(201).json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Login handler
 */
export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Body already validated by validateBody middleware
    const result = await login(req.body);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Refresh token handler
 */
export async function refreshHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Body already validated by validateBody middleware
    const result = await refresh(req.body);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Logout handler
 */
export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Body already validated by validateBody middleware
    await logout(req.body);

    res.json({
      message: 'Logged out successfully',
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current user handler
 */
export async function meHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      const error = new Error('Unauthorized') as AppError;
      error.statusCode = 401;
      throw error;
    }

    const user = await getCurrentUser(req.user.id);
    if (!user) {
      const error = new Error('User not found') as AppError;
      error.statusCode = 404;
      throw error;
    }

    res.json({
      data: user,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

