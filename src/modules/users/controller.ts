import { Request, Response, NextFunction } from 'express';
import {
  getUserProfile,
  updateUserProfile,
  changeUserPassword,
} from './service.js';
import { AppError } from '../../middleware/error.js';

export async function getUserProfileHandler(
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

    const result = await getUserProfile(req.user.id);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function updateUserProfileHandler(
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

    const result = await updateUserProfile(req.user.id, req.body);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

export async function changeUserPasswordHandler(
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

    await changeUserPassword(req.user.id, req.body);

    res.json({
      message: 'Password changed successfully',
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

