import { Request, Response, NextFunction } from 'express';
import {
  createTodo,
  getTodos,
  getTodoById,
  updateTodo,
  deleteTodo,
  batchUpdateTodos,
  batchDeleteTodos,
  getTodoStats,
} from './service.js';
import { AppError } from '../../middleware/error.js';
import type { TodoFilters } from './types.js';

/**
 * Create todo handler
 */
export async function createTodoHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      const error = new Error('Unauthorized') as AppError;
      error.statusCode = 401;
      throw error;
    }

    const workspaceId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const result = await createTodo(workspaceId, req.user.id, req.body);

    res.status(201).json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List todos handler
 */
export async function listTodosHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      const error = new Error('Unauthorized') as AppError;
      error.statusCode = 401;
      throw error;
    }

    const workspaceId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const filters = req.query as unknown as TodoFilters;
    const result = await getTodos(workspaceId, req.user.id, filters);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get todo handler
 */
export async function getTodoHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      const error = new Error('Unauthorized') as AppError;
      error.statusCode = 401;
      throw error;
    }

    const workspaceId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const todoId = typeof req.params.todoId === 'string' ? req.params.todoId : req.params.todoId[0];
    const result = await getTodoById(workspaceId, todoId, req.user.id);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update todo handler
 */
export async function updateTodoHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      const error = new Error('Unauthorized') as AppError;
      error.statusCode = 401;
      throw error;
    }

    const workspaceId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const todoId = typeof req.params.todoId === 'string' ? req.params.todoId : req.params.todoId[0];
    const result = await updateTodo(workspaceId, todoId, req.user.id, req.body);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete todo handler
 */
export async function deleteTodoHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      const error = new Error('Unauthorized') as AppError;
      error.statusCode = 401;
      throw error;
    }

    const workspaceId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const todoId = typeof req.params.todoId === 'string' ? req.params.todoId : req.params.todoId[0];
    await deleteTodo(workspaceId, todoId, req.user.id);

    res.json({
      message: 'Todo deleted successfully',
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Batch update todos handler
 */
export async function batchUpdateTodosHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      const error = new Error('Unauthorized') as AppError;
      error.statusCode = 401;
      throw error;
    }

    const workspaceId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const result = await batchUpdateTodos(workspaceId, req.user.id, req.body);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Batch delete todos handler
 */
export async function batchDeleteTodosHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      const error = new Error('Unauthorized') as AppError;
      error.statusCode = 401;
      throw error;
    }

    const workspaceId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const result = await batchDeleteTodos(workspaceId, req.user.id, req.body);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get todo stats handler
 */
export async function getTodoStatsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      const error = new Error('Unauthorized') as AppError;
      error.statusCode = 401;
      throw error;
    }

    const workspaceId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const result = await getTodoStats(workspaceId, req.user.id);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

