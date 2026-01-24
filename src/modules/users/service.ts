import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { revokeAllUserTokens } from '../auth/refreshToken.service.js';
import type {
  UpdateUserInput,
  ChangePasswordInput,
  UserProfileResponse,
} from './types.js';

/**
 * Get user profile with workspace count
 */
export async function getUserProfile(userId: string): Promise<UserProfileResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      workspaceMembers: {
        select: {
          workspaceId: true,
        },
      },
    },
  });

  if (!user) {
    const error = new Error('User not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    workspaceCount: user.workspaceMembers.length,
  };
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  input: UpdateUserInput
): Promise<UserProfileResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    const error = new Error('User not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      workspaceMembers: {
        select: {
          workspaceId: true,
        },
      },
    },
  });

  return {
    id: updatedUser.id,
    email: updatedUser.email,
    name: updatedUser.name,
    createdAt: updatedUser.createdAt,
    updatedAt: updatedUser.updatedAt,
    workspaceCount: updatedUser.workspaceMembers.length,
  };
}

/**
 * Change user password
 */
export async function changeUserPassword(
  userId: string,
  input: ChangePasswordInput
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    const error = new Error('User not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  // Verify current password
  const isValidPassword = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!isValidPassword) {
    const error = new Error('Current password is incorrect') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  // Hash new password
  const newPasswordHash = await hashPassword(input.newPassword);

  // Update password and revoke all refresh tokens in a transaction
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    // Revoke all refresh tokens for this user
    await revokeAllUserTokens(userId, tx);
  });
}

