import { z } from 'zod';
import { TodoStatus, TodoPriority } from '@prisma/client';

export const createTodoSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less').trim(),
  description: z.string().max(5000, 'Description must be 5000 characters or less').optional(),
  status: z.nativeEnum(TodoStatus, {
    errorMap: () => ({ message: 'Status must be TODO, IN_PROGRESS, DONE, or CANCELLED' }),
  }).optional(),
  priority: z.nativeEnum(TodoPriority, {
    errorMap: () => ({ message: 'Priority must be LOW, MEDIUM, HIGH, or URGENT' }),
  }).optional(),
  dueAt: z.coerce.date().refine(
    (date) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date >= today;
    },
    { message: 'Due date must be today or in the future' }
  ).optional(),
  assignedToId: z.string().cuid('Invalid user ID format').optional(),
});

export const updateTodoSchema = z.object({
  title: z.string().min(1, 'Title must be at least 1 character').max(200, 'Title must be 200 characters or less').trim().optional(),
  description: z.string().max(5000, 'Description must be 5000 characters or less').nullable().optional(),
  status: z.nativeEnum(TodoStatus, {
    errorMap: () => ({ message: 'Status must be TODO, IN_PROGRESS, DONE, or CANCELLED' }),
  }).optional(),
  priority: z.nativeEnum(TodoPriority, {
    errorMap: () => ({ message: 'Priority must be LOW, MEDIUM, HIGH, or URGENT' }),
  }).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  assignedToId: z.string().cuid('Invalid user ID format').nullable().optional(),
});

export const todoFiltersSchema = z.object({
  status: z.nativeEnum(TodoStatus, {
    errorMap: () => ({ message: 'Invalid status' }),
  }).optional(),
  statuses: z.preprocess(
    (val) => {
      if (typeof val === 'string' && val.includes(',')) {
        return val.split(',').map((v) => v.trim());
      }
      return val;
    },
    z.array(z.nativeEnum(TodoStatus)).optional()
  ),
  priority: z.nativeEnum(TodoPriority, {
    errorMap: () => ({ message: 'Invalid priority' }),
  }).optional(),
  priorities: z.preprocess(
    (val) => {
      if (typeof val === 'string' && val.includes(',')) {
        return val.split(',').map((v) => v.trim());
      }
      return val;
    },
    z.array(z.nativeEnum(TodoPriority)).optional()
  ),
  assignedToId: z.string().optional(), // Allow "unassigned" literal
  createdById: z.string().cuid('Invalid user ID format').optional(),
  search: z.string().max(100, 'Search query must be 100 characters or less').optional(),
  dueBefore: z.coerce.date().optional(),
  dueAfter: z.coerce.date().optional(),
  overdue: z.coerce.boolean().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'dueAt', 'priority', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const todoIdParamSchema = z.object({
  todoId: z.string().min(1, 'Todo ID is required'),
});

export const batchUpdateSchema = z.object({
  todoIds: z.array(z.string().min(1)).min(1, 'At least one todo ID is required').max(50, 'Maximum 50 todos can be updated at once'),
  status: z.nativeEnum(TodoStatus, {
    errorMap: () => ({ message: 'Status must be TODO, IN_PROGRESS, DONE, or CANCELLED' }),
  }).optional(),
  priority: z.nativeEnum(TodoPriority, {
    errorMap: () => ({ message: 'Priority must be LOW, MEDIUM, HIGH, or URGENT' }),
  }).optional(),
  assignedToId: z.string().cuid('Invalid user ID format').nullable().optional(),
}).refine(
  (data) => data.status !== undefined || data.priority !== undefined || data.assignedToId !== undefined,
  { message: 'At least one of status, priority, or assignedToId must be provided' }
);

export const batchDeleteSchema = z.object({
  todoIds: z.array(z.string().min(1)).min(1, 'At least one todo ID is required').max(50, 'Maximum 50 todos can be deleted at once'),
});

