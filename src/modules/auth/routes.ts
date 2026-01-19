import { Router, type Router as ExpressRouter } from 'express';
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
} from './controller.js';
import { authRateLimitMiddleware } from '../../middleware/rate-limit-redis.js';
import { authMiddleware } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validation.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} from './schemas.js';

const router: ExpressRouter = Router();

// Public routes with rate limiting
router.post(
  '/register',
  authRateLimitMiddleware,
  validateBody(registerSchema),
  registerHandler
);

router.post(
  '/login',
  authRateLimitMiddleware,
  validateBody(loginSchema),
  loginHandler
);

router.post('/refresh', validateBody(refreshSchema), refreshHandler);
router.post('/logout', validateBody(logoutSchema), logoutHandler);

// Protected route
router.get('/me', authMiddleware, meHandler);

export default router;

