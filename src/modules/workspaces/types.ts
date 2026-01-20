import { WorkspaceRole } from '@prisma/client';

export interface CreateWorkspaceInput {
  name: string;
}

export interface InviteMemberInput {
  email: string;
  role: WorkspaceRole;
}

export interface UpdateMemberRoleInput {
  role: WorkspaceRole;
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  role: WorkspaceRole; // User's role in this workspace
}

export interface WorkspaceMemberResponse {
  userId: string;
  email: string;
  name: string | null;
  role: WorkspaceRole;
  createdAt: Date;
}

