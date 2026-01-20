import type { User, WorkspaceRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
      workspaceMember?: {
        workspaceId: string;
        userId: string;
        role: WorkspaceRole;
      };
    }
  }
}

export {};

