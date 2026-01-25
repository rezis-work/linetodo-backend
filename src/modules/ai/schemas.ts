import { z } from 'zod';

export const chatMessageSchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(4000, 'Message must be 4000 characters or less')
    .trim(),
});

export const todoIdParamSchema = z.object({
  todoId: z.string().cuid('Invalid todo ID'),
});

export const chatHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

