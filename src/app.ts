import express, { Express } from 'express';
import { execSync } from 'child_process';
import { requestIdMiddleware } from './middleware/request-id.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { errorMiddleware } from './middleware/error.js';

function getCommitHash(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(rateLimitMiddleware);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    const commit = getCommitHash();
    res.json({
      status: 'ok',
      commit,
    });
  });

  // Error handling middleware (must be last)
  app.use(errorMiddleware);

  return app;
}

