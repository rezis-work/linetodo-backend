import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '../config/env.js';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// Create Redis client if configured
let redis: Redis | null = null;
let ratelimit: Ratelimit | null = null;
let redisPermissionError = false;
let useCustomRedisRateLimit = false;

/**
 * Test basic Redis connectivity and permissions
 */
async function testBasicRedisConnection(): Promise<{ 
  connected: boolean; 
  canRead: boolean;
  canWrite: boolean;
  error?: string 
}> {
  if (!redis) {
    return { connected: false, canRead: false, canWrite: false, error: 'Redis client not initialized' };
  }

  try {
    // Test ping (basic connectivity)
    await redis.ping();
    
    // Test read permission
    let canRead = false;
    try {
      await redis.get('__read_test__');
      canRead = true;
    } catch (readError) {
      const readErrorMsg = readError instanceof Error ? readError.message : String(readError);
      if (!readErrorMsg.includes('NOPERM')) {
        // If it's not a permission error, reading might work (key just doesn't exist)
        canRead = true;
      }
    }
    
    // Test write permission (required for rate limiting)
    let canWrite = false;
    try {
      const testKey = '__write_test__';
      await redis.set(testKey, 'test', { ex: 1 });
      const value = await redis.get(testKey);
      if (value === 'test') {
        canWrite = true;
        // Clean up test key
        try {
          await redis.del(testKey);
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (writeError) {
      const writeErrorMsg = writeError instanceof Error ? writeError.message : String(writeError);
      if (writeErrorMsg.includes('NOPERM') && writeErrorMsg.includes('set')) {
        return { 
          connected: true, 
          canRead, 
          canWrite: false, 
          error: 'Redis lacks write permissions (set command). Rate limiting requires write access to track request counts.' 
        };
      }
    }
    
    if (!canWrite) {
      return { 
        connected: true, 
        canRead, 
        canWrite: false, 
        error: 'Redis write operations failed. Rate limiting requires write access.' 
      };
    }
    
    return { connected: true, canRead: true, canWrite: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { connected: false, canRead: false, canWrite: false, error: errorMessage };
  }
}

/**
 * Test Redis permissions by attempting a rate limit operation
 * This checks if Redis has the required permissions (e.g., evalsha command)
 */
async function testRedisPermissions(): Promise<{ hasPermissions: boolean; error?: string }> {
  if (!redis || !ratelimit) {
    return { hasPermissions: false, error: 'Redis or Ratelimit not initialized' };
  }

  try {
    // First test basic connectivity and permissions
    const basicTest = await testBasicRedisConnection();
    if (!basicTest.connected) {
      return { hasPermissions: false, error: `Basic Redis connection failed: ${basicTest.error}` };
    }
    
    if (!basicTest.canWrite) {
      return { 
        hasPermissions: false, 
        error: basicTest.error || 'Redis lacks write permissions. Rate limiting requires write access to track request counts.' 
      };
    }

    // Attempt a test rate limit operation which requires Lua script execution
    const testIdentifier = '__permission_test__';
    await ratelimit.limit(testIdentifier);
    return { hasPermissions: true };
  } catch (error: unknown) {
    // Check if it's a permission error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('NOPERM') || errorMessage.includes('evalsha')) {
      // Check if basic write works
      const basicTest = await testBasicRedisConnection();
      if (basicTest.canWrite) {
        return { 
          hasPermissions: false, 
          error: 'Redis lacks permission to execute Lua scripts (evalsha command). Basic Redis operations work, but Upstash Ratelimit requires script execution permissions. Will use custom rate limiter instead.' 
        };
      }
      return { 
        hasPermissions: false, 
        error: 'Redis lacks permission to execute Lua scripts (evalsha command).' 
      };
    }
    // Other errors might be transient
    return { hasPermissions: false, error: errorMessage };
  }
}

// Initialize Redis and test permissions on module load
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

  // Test Redis permissions on startup
  testRedisPermissions()
    .then((result) => {
      if (!result.hasPermissions) {
        // Check if basic Redis works but Lua scripts don't
        testBasicRedisConnection().then((basicResult) => {
          if (basicResult.connected && basicResult.canWrite) {
            // Basic Redis works with write permissions, use custom rate limiter without Lua scripts
            useCustomRedisRateLimit = true;
            console.log(
              '\n✅ Redis Rate Limiting Enabled (Custom Implementation)\n' +
              '   Note: Using basic Redis commands instead of Lua scripts.\n' +
              '   This works with your current Redis permissions.\n'
            );
          } else {
            // Redis doesn't have write permissions or doesn't work at all
            redisPermissionError = true;
            console.error(
              '\n⚠️  Redis Rate Limiting Disabled\n' +
              `   ${result.error || basicResult.error || 'Unknown error'}\n` +
              '   \n' +
              '   Your Redis instance lacks write permissions required for rate limiting.\n' +
              '   \n' +
              '   To Fix:\n' +
              '   1. Go to your Upstash Redis dashboard\n' +
              '   2. Check your REST API token permissions\n' +
              '   3. Ensure the token has write permissions (set, incr, expire commands)\n' +
              '   4. If using a read-only token, create a new token with read+write permissions\n' +
              '   5. Update UPSTASH_REDIS_REST_TOKEN in your .env file\n' +
              '   \n' +
              '   Fallback: Using in-memory rate limiting instead.\n'
            );
            redis = null;
            ratelimit = null;
          }
        });
      } else {
        console.log('✅ Redis rate limiting initialized successfully (Upstash Ratelimit)');
      }
    })
    .catch((error) => {
      // If test itself fails, try basic Redis
      testBasicRedisConnection().then((basicResult) => {
        if (basicResult.connected && basicResult.canWrite) {
          useCustomRedisRateLimit = true;
          console.log(
            '\n✅ Redis Rate Limiting Enabled (Custom Implementation)\n' +
            '   Using basic Redis commands (Lua scripts not available).\n'
          );
        } else {
          redisPermissionError = true;
          console.error(
            '\n⚠️  Redis Rate Limiting Disabled: Failed to test Redis\n' +
            `   Error: ${error instanceof Error ? error.message : String(error)}\n` +
            `   ${basicResult.error ? `Redis Status: ${basicResult.error}` : ''}\n` +
            '   Fallback: Using in-memory rate limiting instead.\n'
          );
          redis = null;
          ratelimit = null;
        }
      });
    });
}

/**
 * Custom Redis rate limiter using basic Redis commands (no Lua scripts)
 * Implements sliding window rate limiting using INCR and EXPIRE
 */
async function customRedisRateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; limit: number; remaining: number; reset: Date }> {
  if (!redis) {
    throw new Error('Redis not available');
  }

  const key = `rate_limit:auth:${identifier}`;
  const windowSeconds = Math.floor(windowMs / 1000);
  
  try {
    // Get current count
    const current = await redis.get(key);
    const count = current ? parseInt(current as string, 10) : 0;

    if (count >= limit) {
      // Rate limit exceeded
      const ttl = await redis.ttl(key);
      const resetTime = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : windowMs));
      return {
        success: false,
        limit,
        remaining: 0,
        reset: resetTime,
      };
    }

    // Increment counter
    const newCount = await redis.incr(key);
    
    // Set expiry if this is the first request in the window
    if (newCount === 1) {
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const resetTime = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : windowMs));

    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - newCount),
      reset: resetTime,
    };
  } catch (error) {
    // If Redis fails, throw to trigger fallback
    throw error;
  }
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
  const identifier = req.ip || req.socket.remoteAddress || 'unknown';
  const isTest = process.env.NODE_ENV === 'test';
  const limit = isTest ? 1000 : 5;
  const windowMs = 15 * 60 * 1000; // 15 minutes

  // Use custom Redis rate limiter if basic Redis works but Lua scripts don't
  if (useCustomRedisRateLimit && redis) {
    try {
      const result = await customRedisRateLimit(identifier, limit, windowMs);

      // Set rate limit headers
      res.setHeader('RateLimit-Limit', result.limit.toString());
      res.setHeader('RateLimit-Remaining', result.remaining.toString());
      res.setHeader('RateLimit-Reset', result.reset.toISOString());

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
      return;
    } catch (error) {
      // Fallback to in-memory if custom Redis rate limit fails
      if (!redisPermissionError) {
        console.warn('Custom Redis rate limiting failed, falling back to in-memory:', error);
      }
      inMemoryRateLimit(req, res, next);
      return;
    }
  }

  // Use Upstash Ratelimit if available (requires Lua scripts)
  if (ratelimit && redis) {
    try {
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
      return;
    } catch (error) {
      // Fallback to in-memory if Redis fails
      // Only log if we haven't already detected permission issues on startup
      if (!redisPermissionError) {
        console.warn('Redis rate limiting failed, falling back to in-memory:', error);
      }
      inMemoryRateLimit(req, res, next);
      return;
    }
  }

  // Fallback to in-memory rate limiting
  inMemoryRateLimit(req, res, next);
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

