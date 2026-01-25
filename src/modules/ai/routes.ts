import { Router, Request, Response, NextFunction } from 'express';
import {
  sendTaskChatHandler,
  getTaskChatHistoryHandler,
  clearTaskChatHandler,
  sendGlobalChatHandler,
  getGlobalChatHistoryHandler,
  clearGlobalChatHandler,
  streamTaskChatHandler,
  streamGlobalChatHandler,
} from './controller.js';
import { requireAuth } from '../../middleware/rbac.js';
import { validateBody, validateQuery } from '../../middleware/validation.js';
import {
  chatMessageSchema,
  todoIdParamSchema,
  chatHistoryQuerySchema,
} from './schemas.js';
import { AppError } from '../../middleware/error.js';

const router: Router = Router();

// Validate todoId param middleware
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

// Task-specific chat routes

// Non-streaming (existing)
router.post(
  '/chat/task/:todoId',
  requireAuth,
  validateTodoIdParam,
  validateBody(chatMessageSchema),
  sendTaskChatHandler
);

// Streaming (NEW)
router.post(
  '/chat/task/:todoId/stream',
  requireAuth,
  validateTodoIdParam,
  validateBody(chatMessageSchema),
  streamTaskChatHandler
);

router.get(
  '/chat/task/:todoId/history',
  requireAuth,
  validateTodoIdParam,
  validateQuery(chatHistoryQuerySchema),
  getTaskChatHistoryHandler
);

router.delete(
  '/chat/task/:todoId',
  requireAuth,
  validateTodoIdParam,
  clearTaskChatHandler
);

// Global chat routes

// Non-streaming (existing)
router.post(
  '/chat/global',
  requireAuth,
  validateBody(chatMessageSchema),
  sendGlobalChatHandler
);

// Streaming (NEW)
router.post(
  '/chat/global/stream',
  requireAuth,
  validateBody(chatMessageSchema),
  streamGlobalChatHandler
);

router.get(
  '/chat/global/history',
  requireAuth,
  validateQuery(chatHistoryQuerySchema),
  getGlobalChatHistoryHandler
);

router.delete(
  '/chat/global',
  requireAuth,
  clearGlobalChatHandler
);

export default router;

