import { Router, Request, Response, NextFunction } from 'express';
import {
  createWorkspaceHandler,
  listWorkspacesHandler,
  getWorkspaceHandler,
  inviteMemberHandler,
  updateMemberRoleHandler,
  removeMemberHandler,
} from './controller.js';
import { requireAuth, requireWorkspaceRole } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validation.js';
import {
  createWorkspaceSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  workspaceIdParamSchema,
  userIdParamSchema,
} from './schemas.js';
import { WorkspaceRole } from '@prisma/client';
import { AppError } from '../../middleware/error.js';

const router: Router = Router();

/**
 * Helper middleware to extract workspaceId from params and apply role check
 */
function requireWorkspaceRoleFromParams(minRole: WorkspaceRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const workspaceId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    if (!workspaceId) {
      const error = new Error('Workspace ID is required') as AppError;
      error.statusCode = 400;
      return next(error);
    }
    return requireWorkspaceRole(workspaceId, minRole)(req, res, next);
  };
}

/**
 * Helper middleware to validate workspaceId param
 */
function validateWorkspaceIdParam(req: Request, _res: Response, next: NextFunction): void {
  try {
    workspaceIdParamSchema.parse({ id: req.params.id });
    next();
  } catch (error) {
    const validationError = new Error('Invalid workspace ID') as AppError;
    validationError.statusCode = 400;
    next(validationError);
  }
}

/**
 * Helper middleware to validate userId param
 */
function validateUserIdParam(req: Request, _res: Response, next: NextFunction): void {
  try {
    userIdParamSchema.parse({ userId: req.params.userId });
    next();
  } catch (error) {
    const validationError = new Error('Invalid user ID') as AppError;
    validationError.statusCode = 400;
    next(validationError);
  }
}

// POST /workspaces - Create workspace
router.post('/', requireAuth, validateBody(createWorkspaceSchema), createWorkspaceHandler);

// GET /workspaces - List user's workspaces
router.get('/', requireAuth, listWorkspacesHandler);

// GET /workspaces/:id - Get workspace details (requires MEMBER role)
router.get(
  '/:id',
  requireAuth,
  validateWorkspaceIdParam,
  requireWorkspaceRoleFromParams('MEMBER'),
  getWorkspaceHandler
);

// POST /workspaces/:id/members - Invite member (requires ADMIN role)
router.post(
  '/:id/members',
  requireAuth,
  validateWorkspaceIdParam,
  requireWorkspaceRoleFromParams('ADMIN'),
  validateBody(inviteMemberSchema),
  inviteMemberHandler
);

// PATCH /workspaces/:id/members/:userId - Update member role (requires ADMIN role)
router.patch(
  '/:id/members/:userId',
  requireAuth,
  validateWorkspaceIdParam,
  validateUserIdParam,
  requireWorkspaceRoleFromParams('ADMIN'),
  validateBody(updateMemberRoleSchema),
  updateMemberRoleHandler
);

// DELETE /workspaces/:id/members/:userId - Remove member (requires ADMIN role)
router.delete(
  '/:id/members/:userId',
  requireAuth,
  validateWorkspaceIdParam,
  validateUserIdParam,
  requireWorkspaceRoleFromParams('ADMIN'),
  removeMemberHandler
);

export default router;

