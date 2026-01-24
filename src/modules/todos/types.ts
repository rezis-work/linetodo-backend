import { TodoStatus, TodoPriority } from '@prisma/client';

export interface CreateTodoInput {
  title: string;
  description?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  dueAt?: Date;
  assignedToId?: string;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string | null;
  status?: TodoStatus;
  priority?: TodoPriority;
  dueAt?: Date | null;
  assignedToId?: string | null;
}

export interface TodoFilters {
  status?: TodoStatus;
  statuses?: TodoStatus[];
  priority?: TodoPriority;
  priorities?: TodoPriority[];
  assignedToId?: string; // Use "unassigned" for null
  createdById?: string;
  search?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  overdue?: boolean;
  sortBy?: 'createdAt' | 'updatedAt' | 'dueAt' | 'priority' | 'title';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface TodoResponse {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  dueAt: Date | null;
  createdById: string;
  assignedToId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isOverdue: boolean;
  creator: {
    id: string;
    email: string;
    name: string | null;
  };
  assignee: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  _count?: {
    comments: number;
  };
}

export interface TodoListResponse {
  todos: TodoResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface BatchUpdateInput {
  todoIds: string[];
  status?: TodoStatus;
  priority?: TodoPriority;
  assignedToId?: string | null;
}

export interface BatchDeleteInput {
  todoIds: string[];
}

export interface TodoStats {
  total: number;
  byStatus: Record<TodoStatus, number>;
  byPriority: Record<TodoPriority, number>;
  overdue: number;
  unassigned: number;
  dueToday: number;
  dueThisWeek: number;
}

