import { Router, Request, Response, NextFunction } from 'express';
import {
  createCalendarEventHandler,
  listCalendarEventsHandler,
  getCalendarEventHandler,
  updateCalendarEventHandler,
  deleteCalendarEventHandler,
  getCalendarStatsHandler,
} from './controller.js';
import { requireAuth, requireWorkspaceRole } from '../../middleware/rbac.js';
import { validateBody, validateQuery } from '../../middleware/validation.js';
import {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  calendarEventFiltersSchema,
  eventIdParamSchema,
} from './schemas.js';
import { WorkspaceRole } from '@prisma/client';
import { AppError } from '../../middleware/error.js';

const router: Router = Router({ mergeParams: true });

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

function validateEventIdParam(req: Request, _res: Response, next: NextFunction): void {
  try {
    eventIdParamSchema.parse({ eventId: req.params.eventId });
    next();
  } catch (error) {
    const validationError = new Error('Invalid event ID') as AppError;
    validationError.statusCode = 400;
    next(validationError);
  }
}

// POST /workspaces/:id/calendar - Create event
router.post(
  '/',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateBody(createCalendarEventSchema),
  createCalendarEventHandler
);

// GET /workspaces/:id/calendar - List events
router.get(
  '/',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateQuery(calendarEventFiltersSchema),
  listCalendarEventsHandler
);

// GET /workspaces/:id/calendar/stats - Get stats
router.get(
  '/stats',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  getCalendarStatsHandler
);

// GET /workspaces/:id/calendar/:eventId - Get single event
router.get(
  '/:eventId',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateEventIdParam,
  getCalendarEventHandler
);

// PATCH /workspaces/:id/calendar/:eventId - Update event
router.patch(
  '/:eventId',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateEventIdParam,
  validateBody(updateCalendarEventSchema),
  updateCalendarEventHandler
);

// DELETE /workspaces/:id/calendar/:eventId - Delete event
router.delete(
  '/:eventId',
  requireAuth,
  requireWorkspaceRoleFromParams('MEMBER'),
  validateEventIdParam,
  deleteCalendarEventHandler
);

export default router;

