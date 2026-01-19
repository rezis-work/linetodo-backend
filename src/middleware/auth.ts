import { Request, Response, NextFunction } from 'express';

/**
 * Placeholder authentication middleware
 * Returns 401 Unauthorized for now
 * Will be implemented in later milestones
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // TODO: Implement authentication logic
  res.status(401).json({
    error: {
      message: 'Unauthorized',
      statusCode: 401,
    },
  });
}

