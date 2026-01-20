import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from './auth.js';
import { AppError } from './error.js';
import { WorkspaceRole } from '@prisma/client';

/**
 * Get numeric hierarchy value for a role
 * OWNER = 3 (highest), ADMIN = 2, MEMBER = 1 (lowest)
 */
function getRoleHierarchy(role: WorkspaceRole): number {
  switch (role) {
    case 'OWNER':
      return 3;
    case 'ADMIN':
      return 2;
    case 'MEMBER':
      return 1;
    default:
      return 0;
  }
}

/**
 * Require authentication middleware
 * Alias for authMiddleware
 */
export const requireAuth = authMiddleware;

/**
 * Require workspace role middleware
 * Checks if user is a member of the workspace and has at least the minimum required role
 * Attaches workspace membership to req.workspaceMember
 */
export function requireWorkspaceRole(
  workspaceId: string,
  minRole: WorkspaceRole
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      const error = new Error('Unauthorized') as AppError;
      error.statusCode = 401;
      return next(error);
    }

    try {
      // Fetch user's membership in the workspace
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: req.user.id,
          },
        },
      });

      if (!membership) {
        const error = new Error('Forbidden: You are not a member of this workspace') as AppError;
        error.statusCode = 403;
        return next(error);
      }

      // Check if user has sufficient role
      const userRoleLevel = getRoleHierarchy(membership.role);
      const minRoleLevel = getRoleHierarchy(minRole);

      if (userRoleLevel < minRoleLevel) {
        const error = new Error(
          `Forbidden: Insufficient role. Required: ${minRole}, Current: ${membership.role}`
        ) as AppError;
        error.statusCode = 403;
        return next(error);
      }

      // Attach workspace membership to request
      req.workspaceMember = {
        workspaceId: membership.workspaceId,
        userId: membership.userId,
        role: membership.role,
      };

      next();
    } catch (error) {
      // Handle database errors
      const dbError = new Error('Failed to verify workspace membership') as AppError;
      dbError.statusCode = 500;
      return next(dbError);
    }
  };
}

