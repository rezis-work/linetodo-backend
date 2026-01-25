import { prisma } from '../../lib/prisma.js';
import { TodoStatus, TodoPriority, Prisma } from '@prisma/client';
import type {
  CreateTodoInput,
  UpdateTodoInput,
  TodoFilters,
  TodoResponse,
  TodoListResponse,
  BatchUpdateInput,
  BatchDeleteInput,
  TodoStats,
} from './types.js';
import { embedTodo, deleteTodoEmbedding } from '../ai/services/embedding.service.js';

/**
 * Verify user is a member of the workspace
 */
async function verifyWorkspaceMembership(workspaceId: string, userId: string) {
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

  return membership;
}

/**
 * Verify assignee is a member of the workspace
 */
async function verifyAssigneeIsMember(workspaceId: string, assigneeId: string): Promise<void> {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: assigneeId,
      },
    },
  });

  if (!membership) {
    const error = new Error('Assignee must be a member of the workspace') as Error & {
      statusCode: number;
    };
    error.statusCode = 400;
    throw error;
  }
}

/**
 * Compute if a todo is overdue
 */
function computeIsOverdue(todo: { dueAt: Date | null; status: TodoStatus }): boolean {
  if (!todo.dueAt) {
    return false;
  }
  const now = new Date();
  return todo.dueAt < now && todo.status !== 'DONE' && todo.status !== 'CANCELLED';
}

/**
 * Get numeric priority order for sorting
 */
function getPriorityOrder(priority: TodoPriority): number {
  switch (priority) {
    case 'URGENT':
      return 4;
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 1;
    default:
      return 0;
  }
}

/**
 * Create a new todo
 */
export async function createTodo(
  workspaceId: string,
  userId: string,
  input: CreateTodoInput
): Promise<TodoResponse> {
  // Verify user is workspace member
  await verifyWorkspaceMembership(workspaceId, userId);

  // If assignedToId provided, verify assignee is workspace member
  if (input.assignedToId) {
    await verifyAssigneeIsMember(workspaceId, input.assignedToId);
  }

  // Create todo
  const todo = await prisma.todo.create({
    data: {
      workspaceId,
      title: input.title,
      description: input.description,
      status: input.status || 'TODO',
      priority: input.priority || 'MEDIUM',
      dueAt: input.dueAt,
      createdById: userId,
      assignedToId: input.assignedToId,
    },
    include: {
      creator: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      assignee: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
  });

  const result = {
    id: todo.id,
    workspaceId: todo.workspaceId,
    title: todo.title,
    description: todo.description,
    status: todo.status,
    priority: todo.priority,
    dueAt: todo.dueAt,
    createdById: todo.createdById,
    assignedToId: todo.assignedToId,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
    isOverdue: computeIsOverdue(todo),
    creator: {
      id: todo.creator.id,
      email: todo.creator.email,
      name: todo.creator.name,
    },
    assignee: todo.assignee
      ? {
          id: todo.assignee.id,
          email: todo.assignee.email,
          name: todo.assignee.name,
        }
      : null,
    _count: todo._count,
  };

  // Fire and forget - don't block response
  embedTodo(todo.id).catch(console.error);

  return result;
}

/**
 * Get todos with filtering, pagination, and sorting
 */
export async function getTodos(
  workspaceId: string,
  userId: string,
  filters: TodoFilters
): Promise<TodoListResponse> {
  // Verify user is workspace member
  await verifyWorkspaceMembership(workspaceId, userId);

  // Build where clause
  const where: Prisma.TodoWhereInput = {
    workspaceId,
  };

  // Status filter
  if (filters.status) {
    where.status = filters.status;
  } else if (filters.statuses && filters.statuses.length > 0) {
    where.status = { in: filters.statuses };
  }

  // Priority filter
  if (filters.priority) {
    where.priority = filters.priority;
  } else if (filters.priorities && filters.priorities.length > 0) {
    where.priority = { in: filters.priorities };
  }

  // Assignee filter
  if (filters.assignedToId) {
    if (filters.assignedToId === 'unassigned') {
      where.assignedToId = null;
    } else {
      where.assignedToId = filters.assignedToId;
    }
  }

  // Creator filter
  if (filters.createdById) {
    where.createdById = filters.createdById;
  }

  // Search filter
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  // Date filters
  if (filters.dueBefore || filters.dueAfter) {
    where.dueAt = {};
    if (filters.dueBefore) {
      where.dueAt.lte = filters.dueBefore;
    }
    if (filters.dueAfter) {
      where.dueAt.gte = filters.dueAfter;
    }
  }

  // Overdue filter
  if (filters.overdue) {
    const now = new Date();
    where.dueAt = { lt: now };
    where.status = { notIn: ['DONE', 'CANCELLED'] };
  }

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  // Build orderBy
  let orderBy: Prisma.TodoOrderByWithRelationInput | Prisma.TodoOrderByWithRelationInput[] = {};
  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';

  if (sortBy === 'priority') {
    // Custom sorting for priority requires fetching and sorting in memory
    // For now, use a simpler approach with Prisma
    orderBy = { priority: sortOrder };
  } else {
    orderBy = { [sortBy]: sortOrder };
  }

  // Get total count
  const total = await prisma.todo.count({ where });

  // Get todos
  const todos = await prisma.todo.findMany({
    where,
    skip,
    take: limit,
    orderBy,
    include: {
      creator: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      assignee: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
  });

  // Transform todos and compute isOverdue
  const todoResponses: TodoResponse[] = todos.map((todo) => ({
    id: todo.id,
    workspaceId: todo.workspaceId,
    title: todo.title,
    description: todo.description,
    status: todo.status,
    priority: todo.priority,
    dueAt: todo.dueAt,
    createdById: todo.createdById,
    assignedToId: todo.assignedToId,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
    isOverdue: computeIsOverdue(todo),
    creator: {
      id: todo.creator.id,
      email: todo.creator.email,
      name: todo.creator.name,
    },
    assignee: todo.assignee
      ? {
          id: todo.assignee.id,
          email: todo.assignee.email,
          name: todo.assignee.name,
        }
      : null,
    _count: todo._count,
  }));

  // Sort by priority if needed (after fetching)
  if (sortBy === 'priority') {
    todoResponses.sort((a, b) => {
      const priorityA = getPriorityOrder(a.priority);
      const priorityB = getPriorityOrder(b.priority);
      return sortOrder === 'desc' ? priorityB - priorityA : priorityA - priorityB;
    });
  }

  const totalPages = Math.ceil(total / limit);

  return {
    todos: todoResponses,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Get todo by ID
 */
export async function getTodoById(
  workspaceId: string,
  todoId: string,
  userId: string
): Promise<TodoResponse> {
  // Verify user is workspace member
  await verifyWorkspaceMembership(workspaceId, userId);

  // Find todo
  const todo = await prisma.todo.findFirst({
    where: {
      id: todoId,
      workspaceId,
    },
    include: {
      creator: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      assignee: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
  });

  if (!todo) {
    const error = new Error('Todo not found') as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }

  return {
    id: todo.id,
    workspaceId: todo.workspaceId,
    title: todo.title,
    description: todo.description,
    status: todo.status,
    priority: todo.priority,
    dueAt: todo.dueAt,
    createdById: todo.createdById,
    assignedToId: todo.assignedToId,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
    isOverdue: computeIsOverdue(todo),
    creator: {
      id: todo.creator.id,
      email: todo.creator.email,
      name: todo.creator.name,
    },
    assignee: todo.assignee
      ? {
          id: todo.assignee.id,
          email: todo.assignee.email,
          name: todo.assignee.name,
        }
      : null,
    _count: todo._count,
  };
}

/**
 * Update todo
 */
export async function updateTodo(
  workspaceId: string,
  todoId: string,
  userId: string,
  input: UpdateTodoInput
): Promise<TodoResponse> {
  // Verify user is workspace member
  await verifyWorkspaceMembership(workspaceId, userId);

  // Find existing todo
  const existingTodo = await prisma.todo.findFirst({
    where: {
      id: todoId,
      workspaceId,
    },
  });

  if (!existingTodo) {
    const error = new Error('Todo not found') as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }

  // If assignedToId is changing and not null, verify new assignee is workspace member
  if (input.assignedToId !== undefined && input.assignedToId !== null) {
    await verifyAssigneeIsMember(workspaceId, input.assignedToId);
  }

  // Update todo
  const todo = await prisma.todo.update({
    where: { id: todoId },
    data: {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      dueAt: input.dueAt,
      assignedToId: input.assignedToId,
    },
    include: {
      creator: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      assignee: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
  });

  return {
    id: todo.id,
    workspaceId: todo.workspaceId,
    title: todo.title,
    description: todo.description,
    status: todo.status,
    priority: todo.priority,
    dueAt: todo.dueAt,
    createdById: todo.createdById,
    assignedToId: todo.assignedToId,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
    isOverdue: computeIsOverdue(todo),
    creator: {
      id: todo.creator.id,
      email: todo.creator.email,
      name: todo.creator.name,
    },
    assignee: todo.assignee
      ? {
          id: todo.assignee.id,
          email: todo.assignee.email,
          name: todo.assignee.name,
        }
      : null,
    _count: todo._count,
  };

  // Fire and forget - don't block response
  embedTodo(todo.id).catch(console.error);
}

/**
 * Delete todo
 */
export async function deleteTodo(workspaceId: string, todoId: string, userId: string): Promise<void> {
  // Verify user is workspace member and get role
  const membership = await verifyWorkspaceMembership(workspaceId, userId);

  // Find todo
  const todo = await prisma.todo.findFirst({
    where: {
      id: todoId,
      workspaceId,
    },
  });

  if (!todo) {
    const error = new Error('Todo not found') as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }

  // Authorization check: user is creator OR has ADMIN/OWNER role
  const isCreator = todo.createdById === userId;
  const isAdminOrOwner = membership.role === 'ADMIN' || membership.role === 'OWNER';

  if (!isCreator && !isAdminOrOwner) {
    const error = new Error("You don't have permission to delete this todo") as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    throw error;
  }

  // Delete todo (comments cascade via Prisma)
  await prisma.todo.delete({
    where: { id: todoId },
  });

  // Fire and forget - don't block response
  deleteTodoEmbedding(todoId).catch(console.error);
}

/**
 * Batch update todos
 */
export async function batchUpdateTodos(
  workspaceId: string,
  userId: string,
  input: BatchUpdateInput
): Promise<{ updated: number }> {
  // Verify user is workspace member
  await verifyWorkspaceMembership(workspaceId, userId);

  // If assignedToId provided and not null, verify assignee is member
  if (input.assignedToId !== undefined && input.assignedToId !== null) {
    await verifyAssigneeIsMember(workspaceId, input.assignedToId);
  }

  // Build update data conditionally
  const updateData: Prisma.TodoUpdateManyMutationInput = {};
  if (input.status !== undefined) {
    updateData.status = input.status;
  }
  if (input.priority !== undefined) {
    updateData.priority = input.priority;
  }
  if (input.assignedToId !== undefined) {
    // assignedToId is a scalar field and works at runtime with updateMany
    // TypeScript types don't include it, but we can safely assign it
    (updateData as Record<string, unknown>).assignedToId = input.assignedToId;
  }

  // Update all matching todos
  const result = await prisma.todo.updateMany({
    where: {
      id: { in: input.todoIds },
      workspaceId,
    },
    data: updateData,
  });

  return { updated: result.count };
}

/**
 * Batch delete todos
 */
export async function batchDeleteTodos(
  workspaceId: string,
  userId: string,
  input: BatchDeleteInput
): Promise<{ deleted: number }> {
  // Verify user is workspace member and get role
  const membership = await verifyWorkspaceMembership(workspaceId, userId);

  // Build where clause
  const where: Prisma.TodoWhereInput = {
    id: { in: input.todoIds },
    workspaceId,
  };

  // If not ADMIN or OWNER, filter to only todos created by user
  if (membership.role !== 'ADMIN' && membership.role !== 'OWNER') {
    where.createdById = userId;
  }

  // Delete matching todos
  const result = await prisma.todo.deleteMany({
    where,
  });

  return { deleted: result.count };
}

/**
 * Get todo statistics
 */
export async function getTodoStats(workspaceId: string, userId: string): Promise<TodoStats> {
  // Verify user is workspace member
  await verifyWorkspaceMembership(workspaceId, userId);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Get total count
  const total = await prisma.todo.count({
    where: { workspaceId },
  });

  // Group by status
  const statusGroups = await prisma.todo.groupBy({
    by: ['status'],
    where: { workspaceId },
    _count: true,
  });

  const byStatus: Record<TodoStatus, number> = {
    TODO: 0,
    IN_PROGRESS: 0,
    DONE: 0,
    CANCELLED: 0,
  };

  statusGroups.forEach((group) => {
    byStatus[group.status] = group._count;
  });

  // Group by priority
  const priorityGroups = await prisma.todo.groupBy({
    by: ['priority'],
    where: { workspaceId },
    _count: true,
  });

  const byPriority: Record<TodoPriority, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    URGENT: 0,
  };

  priorityGroups.forEach((group) => {
    byPriority[group.priority] = group._count;
  });

  // Count overdue
  const overdue = await prisma.todo.count({
    where: {
      workspaceId,
      dueAt: { lt: now },
      status: { notIn: ['DONE', 'CANCELLED'] },
    },
  });

  // Count unassigned
  const unassigned = await prisma.todo.count({
    where: {
      workspaceId,
      assignedToId: null,
    },
  });

  // Count due today
  const dueToday = await prisma.todo.count({
    where: {
      workspaceId,
      dueAt: {
        gte: todayStart,
        lt: todayEnd,
      },
    },
  });

  // Count due this week
  const dueThisWeek = await prisma.todo.count({
    where: {
      workspaceId,
      dueAt: {
        gte: todayStart,
        lt: weekEnd,
      },
    },
  });

  return {
    total,
    byStatus,
    byPriority,
    overdue,
    unassigned,
    dueToday,
    dueThisWeek,
  };
}

