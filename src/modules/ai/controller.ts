import { Request, Response, NextFunction } from 'express';
import {
  sendTaskMessage,
  sendGlobalMessage,
  getChatHistory,
  clearChatHistory,
  streamTaskMessage,
  streamGlobalMessage,
} from './services/chat.service.js';
import { AppError } from '../../middleware/error.js';
import { initSSE, sendSSE, sendSSEError, endSSE } from './lib/sse.js';

export async function sendTaskChatHandler(
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

    const todoId = Array.isArray(req.params.todoId) ? req.params.todoId[0] : req.params.todoId;
    const { message } = req.body;

    const result = await sendTaskMessage(req.user.id, todoId, message);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function getTaskChatHistoryHandler(
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

    const todoId = Array.isArray(req.params.todoId) ? req.params.todoId[0] : req.params.todoId;
    const limit = Number(req.query.limit) || 50;

    const result = await getChatHistory(req.user.id, 'TASK', todoId, limit);

    res.json({
      data: result || { sessionId: null, chatType: 'TASK', todoId, messages: [] },
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function clearTaskChatHandler(
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

    const todoId = Array.isArray(req.params.todoId) ? req.params.todoId[0] : req.params.todoId;
    await clearChatHistory(req.user.id, 'TASK', todoId);

    res.json({
      message: 'Chat history cleared',
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function sendGlobalChatHandler(
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

    const { message } = req.body;
    const result = await sendGlobalMessage(req.user.id, message);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function getGlobalChatHistoryHandler(
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

    const limit = Number(req.query.limit) || 50;
    const result = await getChatHistory(req.user.id, 'GLOBAL', undefined, limit);

    res.json({
      data: result || { sessionId: null, chatType: 'GLOBAL', todoId: null, messages: [] },
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function clearGlobalChatHandler(
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

    await clearChatHistory(req.user.id, 'GLOBAL');

    res.json({
      message: 'Chat history cleared',
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Stream task chat response via SSE
 */
export async function streamTaskChatHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  // Check auth before initializing SSE
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const todoId = Array.isArray(req.params.todoId) ? req.params.todoId[0] : req.params.todoId;
  const { message } = req.body;

  // Initialize SSE connection
  initSSE(res);

  try {
    // Stream the response
    for await (const event of streamTaskMessage(req.user.id, todoId, message)) {
      sendSSE(res, event);
    }

    endSSE(res);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for specific error types
    if (errorMessage.includes('not found') || errorMessage.includes('not a member')) {
      sendSSEError(res, errorMessage);
    } else {
      console.error('Stream task chat error:', error);
      sendSSEError(res, 'Failed to generate response');
    }
  }
}

/**
 * Stream global chat response via SSE
 */
export async function streamGlobalChatHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  // Check auth before initializing SSE
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { message } = req.body;

  // Initialize SSE connection
  initSSE(res);

  try {
    // Stream the response
    for await (const event of streamGlobalMessage(req.user.id, message)) {
      sendSSE(res, event);
    }

    endSSE(res);
  } catch (error) {
    console.error('Stream global chat error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendSSEError(res, errorMessage);
  }
}

