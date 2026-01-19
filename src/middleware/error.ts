import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

export interface AppError extends Error {
  statusCode?: number;
  status?: number;
}

export function errorMiddleware(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(
    {
      err,
      statusCode,
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id'],
    },
    'Request error'
  );

  const requestId = req.headers['x-request-id'];

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
      requestId: requestId || undefined,
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}

