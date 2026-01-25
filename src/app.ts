import express, { Express } from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
import { requestIdMiddleware } from './middleware/request-id.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { errorMiddleware } from './middleware/error.js';
import authRoutes from './modules/auth/routes.js';
import userRoutes from './modules/users/routes.js';
import workspaceRoutes from './modules/workspaces/routes.js';
import todoRoutes from './modules/todos/routes.js';
import calendarRoutes from './modules/calendar/routes.js';
import aiRoutes from './modules/ai/routes.js';

function getCommitHash(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

export function createApp(): Express {
  const app = express();

  // CORS configuration
  const allowedOrigins = [
    'http://localhost:3000',
    'https://line-todo-front.vercel.app',
    'https://taskinio.space',
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true, // Allow cookies/auth headers
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    })
  );

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

  // Auth routes
  app.use('/auth', authRoutes);

  // User routes
  app.use('/users', userRoutes);

  // Workspace routes
  app.use('/workspaces', workspaceRoutes);

  // Todo routes (nested under workspaces)
  app.use('/workspaces/:id/todos', todoRoutes);

  // Calendar routes (nested under workspaces)
  app.use('/workspaces/:id/calendar', calendarRoutes);

  // AI routes
  app.use('/ai', aiRoutes);

  // Error handling middleware (must be last)
  app.use(errorMiddleware);

  return app;
}

