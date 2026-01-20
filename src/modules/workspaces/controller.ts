import { Request, Response, NextFunction } from 'express';
import {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceById,
  inviteMember,
  updateMemberRole,
  removeMember,
} from './service.js';
import { AppError } from '../../middleware/error.js';

/**
 * Create workspace handler
 */
export async function createWorkspaceHandler(
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

    const result = await createWorkspace(req.user.id, req.body);

    res.status(201).json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List workspaces handler
 */
export async function listWorkspacesHandler(
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

    const workspaces = await getUserWorkspaces(req.user.id);

    res.json({
      data: workspaces,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get workspace handler
 */
export async function getWorkspaceHandler(
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
    const workspace = await getWorkspaceById(workspaceId, req.user.id);

    res.json({
      data: workspace,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Invite member handler
 */
export async function inviteMemberHandler(
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
    const result = await inviteMember(workspaceId, req.body, req.user.id);

    res.status(201).json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update member role handler
 */
export async function updateMemberRoleHandler(
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
    const userId = typeof req.params.userId === 'string' ? req.params.userId : req.params.userId[0];
    const result = await updateMemberRole(workspaceId, userId, req.body, req.user.id);

    res.json({
      data: result,
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Remove member handler
 */
export async function removeMemberHandler(
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
    const userId = typeof req.params.userId === 'string' ? req.params.userId : req.params.userId[0];
    await removeMember(workspaceId, userId, req.user.id);

    res.json({
      message: 'Member removed successfully',
      requestId: req.headers['x-request-id'],
    });
  } catch (error) {
    next(error);
  }
}

