import { Request, Response, NextFunction } from 'express';
import {
  createCalendarEvent,
  getCalendarEvents,
  getCalendarEventById,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarStats,
} from './service.js';
import { AppError } from '../../middleware/error.js';
import type { CalendarEventFilters } from './types.js';

export async function createCalendarEventHandler(
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
    const result = await createCalendarEvent(workspaceId, req.user.id, req.body);

    res.status(201).json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function listCalendarEventsHandler(
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
    const filters = req.query as unknown as CalendarEventFilters;
    const result = await getCalendarEvents(workspaceId, req.user.id, filters);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function getCalendarEventHandler(
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
    const eventId = typeof req.params.eventId === 'string' ? req.params.eventId : req.params.eventId[0];
    const result = await getCalendarEventById(workspaceId, eventId, req.user.id);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCalendarEventHandler(
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
    const eventId = typeof req.params.eventId === 'string' ? req.params.eventId : req.params.eventId[0];
    const result = await updateCalendarEvent(workspaceId, eventId, req.user.id, req.body);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCalendarEventHandler(
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
    const eventId = typeof req.params.eventId === 'string' ? req.params.eventId : req.params.eventId[0];
    await deleteCalendarEvent(workspaceId, eventId, req.user.id);

    res.json({
      message: 'Calendar event deleted successfully',
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function getCalendarStatsHandler(
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
    const result = await getCalendarStats(workspaceId, req.user.id);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

