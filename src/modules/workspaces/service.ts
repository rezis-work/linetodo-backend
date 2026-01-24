import { prisma } from '../../lib/prisma.js';
import { WorkspaceRole } from '@prisma/client';
import type {
  CreateWorkspaceInput,
  InviteMemberInput,
  UpdateMemberRoleInput,
  UpdateWorkspaceInput,
  WorkspaceResponse,
  WorkspaceMemberResponse,
} from './types.js';

/**
 * Get numeric hierarchy value for a role
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
 * Create a new workspace
 * Creates workspace and adds creator as OWNER
 */
export async function createWorkspace(
  userId: string,
  input: CreateWorkspaceInput
): Promise<WorkspaceResponse> {
  // Create workspace and workspace member in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create workspace
    const workspace = await tx.workspace.create({
      data: {
        name: input.name,
        ownerId: userId,
      },
    });

    // Add creator as OWNER
    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId,
        role: 'OWNER',
      },
    });

    return workspace;
  });

  return {
    id: result.id,
    name: result.name,
    ownerId: result.ownerId,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    role: 'OWNER',
  };
}

/**
 * Get all workspaces user is a member of
 */
export async function getUserWorkspaces(userId: string): Promise<WorkspaceResponse[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    ownerId: membership.workspace.ownerId,
    createdAt: membership.workspace.createdAt,
    updatedAt: membership.workspace.updatedAt,
    role: membership.role,
  }));
}

/**
 * Get workspace by ID (verifies membership)
 */
export async function getWorkspaceById(
  workspaceId: string,
  userId: string
): Promise<WorkspaceResponse> {
  // Find workspace and user's membership
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    include: {
      workspace: true,
    },
  });

  if (!membership) {
    const error = new Error('Workspace not found or you are not a member') as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }

  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    ownerId: membership.workspace.ownerId,
    createdAt: membership.workspace.createdAt,
    updatedAt: membership.workspace.updatedAt,
    role: membership.role,
  };
}

/**
 * Invite a member to a workspace
 * Verifies inviter has ADMIN or OWNER role
 */
export async function inviteMember(
  workspaceId: string,
  input: InviteMemberInput,
  inviterId: string
): Promise<WorkspaceMemberResponse> {
  // Verify inviter's role
  const inviterMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: inviterId,
      },
    },
  });

  if (!inviterMembership) {
    const error = new Error('You are not a member of this workspace') as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    throw error;
  }

  const inviterRoleLevel = getRoleHierarchy(inviterMembership.role);
  const adminRoleLevel = getRoleHierarchy('ADMIN');

  if (inviterRoleLevel < adminRoleLevel) {
    const error = new Error('Insufficient permissions to invite members') as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    throw error;
  }

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    const error = new Error('User not found') as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }

  // Check if user is already a member
  const existingMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id,
      },
    },
  });

  if (existingMembership) {
    const error = new Error('User is already a member of this workspace') as Error & {
      statusCode: number;
    };
    error.statusCode = 409;
    throw error;
  }

  // Create workspace member
  const membership = await prisma.workspaceMember.create({
    data: {
      workspaceId,
      userId: user.id,
      role: input.role,
    },
    include: {
      user: true,
    },
  });

  return {
    userId: membership.userId,
    email: membership.user.email,
    name: membership.user.name,
    role: membership.role,
    createdAt: membership.createdAt,
  };
}

/**
 * Update member role
 * Verifies updater has ADMIN or OWNER role
 * Prevents changing OWNER role
 * Prevents downgrading last OWNER
 */
export async function updateMemberRole(
  workspaceId: string,
  targetUserId: string,
  input: UpdateMemberRoleInput,
  updaterId: string
): Promise<WorkspaceMemberResponse> {
  // Verify updater's role
  const updaterMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: updaterId,
      },
    },
  });

  if (!updaterMembership) {
    const error = new Error('You are not a member of this workspace') as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    throw error;
  }

  const updaterRoleLevel = getRoleHierarchy(updaterMembership.role);
  const adminRoleLevel = getRoleHierarchy('ADMIN');

  if (updaterRoleLevel < adminRoleLevel) {
    const error = new Error('Insufficient permissions to update member roles') as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    throw error;
  }

  // Get target member
  const targetMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: targetUserId,
      },
    },
  });

  if (!targetMembership) {
    const error = new Error('Member not found') as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }

  // Prevent changing OWNER role (except transfer ownership - future feature)
  if (targetMembership.role === 'OWNER' && input.role !== 'OWNER') {
    const error = new Error('Cannot change OWNER role') as Error & {
      statusCode: number;
    };
    error.statusCode = 400;
    throw error;
  }

  // Prevent downgrading last OWNER
  if (targetMembership.role === 'OWNER' && input.role !== 'OWNER') {
    const ownerCount = await prisma.workspaceMember.count({
      where: {
        workspaceId,
        role: 'OWNER',
      },
    });

    if (ownerCount === 1) {
      const error = new Error('Cannot downgrade the last OWNER') as Error & {
        statusCode: number;
      };
      error.statusCode = 400;
      throw error;
    }
  }

  // Update member role
  const updatedMembership = await prisma.workspaceMember.update({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: targetUserId,
      },
    },
    data: {
      role: input.role,
    },
    include: {
      user: true,
    },
  });

  return {
    userId: updatedMembership.userId,
    email: updatedMembership.user.email,
    name: updatedMembership.user.name,
    role: updatedMembership.role,
    createdAt: updatedMembership.createdAt,
  };
}

/**
 * Remove member from workspace
 * Verifies remover has ADMIN or OWNER role
 * Prevents removing last OWNER
 * Prevents removing self if OWNER
 */
export async function removeMember(
  workspaceId: string,
  targetUserId: string,
  removerId: string
): Promise<void> {
  // Verify remover's role
  const removerMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: removerId,
      },
    },
  });

  if (!removerMembership) {
    const error = new Error('You are not a member of this workspace') as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    throw error;
  }

  const removerRoleLevel = getRoleHierarchy(removerMembership.role);
  const adminRoleLevel = getRoleHierarchy('ADMIN');

  if (removerRoleLevel < adminRoleLevel) {
    const error = new Error('Insufficient permissions to remove members') as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    throw error;
  }

  // Get target member
  const targetMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: targetUserId,
      },
    },
  });

  if (!targetMembership) {
    const error = new Error('Member not found') as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }

  // Prevent removing self if OWNER
  if (targetUserId === removerId && targetMembership.role === 'OWNER') {
    const error = new Error('Cannot remove yourself as OWNER') as Error & {
      statusCode: number;
    };
    error.statusCode = 400;
    throw error;
  }

  // Prevent removing last OWNER
  if (targetMembership.role === 'OWNER') {
    const ownerCount = await prisma.workspaceMember.count({
      where: {
        workspaceId,
        role: 'OWNER',
      },
    });

    if (ownerCount === 1) {
      const error = new Error('Cannot remove the last OWNER') as Error & {
        statusCode: number;
      };
      error.statusCode = 400;
      throw error;
    }
  }

  // Remove member
  await prisma.workspaceMember.delete({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: targetUserId,
      },
    },
  });
}

/**
 * Get all members of a workspace
 * Verifies user is a member of the workspace
 */
export async function getWorkspaceMembers(
  workspaceId: string,
  userId: string
): Promise<WorkspaceMemberResponse[]> {
  // Verify user is a member
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  if (!membership) {
    const error = new Error('Workspace not found or you are not a member') as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }

  // Get all members
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: true },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return members.map((m) => ({
    userId: m.userId,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
    createdAt: m.createdAt,
  }));
}

/**
 * Update workspace
 * Verifies user is OWNER of the workspace
 */
export async function updateWorkspace(
  workspaceId: string,
  input: UpdateWorkspaceInput,
  userId: string
): Promise<WorkspaceResponse> {
  // Verify user is OWNER
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    include: {
      workspace: true,
    },
  });

  if (!membership) {
    const error = new Error('Workspace not found or you are not a member') as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }

  if (membership.role !== 'OWNER') {
    const error = new Error('Only workspace owners can update workspace details') as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    throw error;
  }

  // Update workspace
  const updatedWorkspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      name: input.name,
    },
  });

  return {
    id: updatedWorkspace.id,
    name: updatedWorkspace.name,
    ownerId: updatedWorkspace.ownerId,
    createdAt: updatedWorkspace.createdAt,
    updatedAt: updatedWorkspace.updatedAt,
    role: 'OWNER',
  };
}

