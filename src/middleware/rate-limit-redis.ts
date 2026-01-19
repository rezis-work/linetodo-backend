import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '../config/env.js';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// Create Redis client if configured
let redis: Redis | null = null;
let ratelimit: Ratelimit | null = null;

if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  // Use higher limits in test mode
  const isTest = process.env.NODE_ENV === 'test';
  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(isTest ? 1000 : 5, '15 m'),
    analytics: true,
  });
}

/**
 * Rate limiter for auth endpoints using Upstash Redis
 * Falls back to in-memory rate limiting if Redis not configured
 */
export const authRateLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Use Upstash Redis if available
  if (ratelimit && redis) {
    try {
      const identifier = req.ip || req.socket.remoteAddress || 'unknown';
      const result = await ratelimit.limit(identifier);

      // Set rate limit headers
      res.setHeader('RateLimit-Limit', result.limit.toString());
      res.setHeader('RateLimit-Remaining', result.remaining.toString());
      res.setHeader('RateLimit-Reset', new Date(result.reset).toISOString());

      if (!result.success) {
        res.status(429).json({
          error: {
            message: 'Too many authentication attempts, please try again later.',
            statusCode: 429,
            requestId: req.headers['x-request-id'],
          },
        });
        return;
      }

      next();
    } catch (error) {
      // Fallback to in-memory if Redis fails
      console.warn('Redis rate limiting failed, falling back to in-memory:', error);
      return inMemoryRateLimit(req, res, next);
    }
  } else {
    // Fallback to in-memory rate limiting
    return inMemoryRateLimit(req, res, next);
  }
};

// In-memory rate limiter as fallback
// Use higher limits in test mode to avoid test failures
const isTest = process.env.NODE_ENV === 'test';
const inMemoryRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 1000 : 5, // Much higher limit in test mode
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        message: 'Too many authentication attempts, please try again later.',
        statusCode: 429,
        requestId: req.headers['x-request-id'],
      },
    });
  },
});

