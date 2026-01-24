import { Router } from 'express';
import {
  getUserProfileHandler,
  updateUserProfileHandler,
  changeUserPasswordHandler,
} from './controller.js';
import { requireAuth } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validation.js';
import {
  updateUserSchema,
  changePasswordSchema,
} from './schemas.js';

const router: Router = Router();

// GET /users/me - Get current user profile
router.get(
  '/me',
  requireAuth,
  getUserProfileHandler
);

// PATCH /users/me - Update user profile
router.patch(
  '/me',
  requireAuth,
  validateBody(updateUserSchema),
  updateUserProfileHandler
);

// PATCH /users/me/password - Change password
router.patch(
  '/me/password',
  requireAuth,
  validateBody(changePasswordSchema),
  changeUserPasswordHandler
);

export default router;

