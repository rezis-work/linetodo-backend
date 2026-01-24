import { z } from 'zod';
import { WorkspaceRole } from '@prisma/client';

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100, 'Workspace name must be 100 characters or less'),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.nativeEnum(WorkspaceRole, {
    errorMap: () => ({ message: 'Role must be OWNER, ADMIN, or MEMBER' }),
  }),
});

export const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(WorkspaceRole, {
    errorMap: () => ({ message: 'Role must be OWNER, ADMIN, or MEMBER' }),
  }),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100, 'Workspace name must be 100 characters or less'),
});

export const workspaceIdParamSchema = z.object({
  id: z.string().min(1, 'Workspace ID is required'),
});

export const userIdParamSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

