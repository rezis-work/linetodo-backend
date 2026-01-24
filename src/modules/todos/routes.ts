import { Router, Request, Response, NextFunction } from 'express';
import {
  createTodoHandler,
  listTodosHandler,
  getTodoHandler,
  updateTodoHandler,
  deleteTodoHandler,
  batchUpdateTodosHandler,
  batchDeleteTodosHandler,
  getTodoStatsHandler,
} from './controller.js';
import { requireAuth, requireWorkspaceRole } from '../../middleware/rbac.js';
import { validateBody, validateQuery } from '../../middleware/validation.js';
import {
  createTodoSchema,
  updateTodoSchema,
  todoFiltersSchema,
  todoIdParamSchema,
  batchUpdateSchema,
  batchDeleteSchema,
} from './schemas.js';
import { WorkspaceRole } from '@prisma/client';
import { AppError } from '../../middleware/error.js';

const router: Router = Router({ mergeParams: true }); // mergeParams to access parent route params

/**
 * Helper middleware to extract workspaceId from params and apply role check
 */
function requireWorkspaceRoleFromParams(minRole: WorkspaceRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // workspaceId comes from parent route (:id)
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
 * Helper middleware to validate todoId param
 */
function validateTodoIdParam(req: Request, _res: Response, next: NextFunction): void {
  try {
    todoIdParamSchema.parse({ todoId: req.params.todoId });
    next();
  } catch (error) {
    const validationError = new Error('Invalid todo ID') as AppError;
    validationError.statusCode = 400;
    next(validationError);
  }
}

// All routes require authentication and MEMBER+ role
// Route order: /stats and /batch BEFORE /:todoId to prevent param conflicts

// POST /workspaces/:id/todos - Create todo
router.post(
  '/',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateBody(createTodoSchema),
  createTodoHandler
);

// GET /workspaces/:id/todos - List todos with filters
router.get(
  '/',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateQuery(todoFiltersSchema),
  listTodosHandler
);

// GET /workspaces/:id/todos/stats - Get todo statistics
router.get(
  '/stats',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  getTodoStatsHandler
);

// PATCH /workspaces/:id/todos/batch - Batch update todos
router.patch(
  '/batch',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateBody(batchUpdateSchema),
  batchUpdateTodosHandler
);

// DELETE /workspaces/:id/todos/batch - Batch delete todos
router.delete(
  '/batch',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateBody(batchDeleteSchema),
  batchDeleteTodosHandler
);

// GET /workspaces/:id/todos/:todoId - Get single todo
router.get(
  '/:todoId',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateTodoIdParam,
  getTodoHandler
);

// PATCH /workspaces/:id/todos/:todoId - Update todo
router.patch(
  '/:todoId',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateTodoIdParam,
  validateBody(updateTodoSchema),
  updateTodoHandler
);

// DELETE /workspaces/:id/todos/:todoId - Delete todo
router.delete(
  '/:todoId',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateTodoIdParam,
  deleteTodoHandler
);

export default router;

