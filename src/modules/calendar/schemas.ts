import { z } from 'zod';

export const createCalendarEventSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less')
    .trim(),
  startAt: z.coerce.date({
    errorMap: () => ({ message: 'Start date is required' }),
  }),
  endAt: z.coerce.date({
    errorMap: () => ({ message: 'End date is required' }),
  }),
  relatedTodoId: z.string().cuid('Invalid todo ID format').optional(),
}).refine(
  (data) => data.endAt >= data.startAt,
  { message: 'End date must be after or equal to start date', path: ['endAt'] }
);

export const updateCalendarEventSchema = z.object({
  title: z
    .string()
    .min(1, 'Title must be at least 1 character')
    .max(200, 'Title must be 200 characters or less')
    .trim()
    .optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  relatedTodoId: z.string().cuid('Invalid todo ID format').nullable().optional(),
}).refine(
  (data) => {
    if (data.startAt && data.endAt) {
      return data.endAt >= data.startAt;
    }
    return true;
  },
  { message: 'End date must be after or equal to start date', path: ['endAt'] }
);

export const calendarEventFiltersSchema = z.object({
  startAfter: z.coerce.date().optional(),
  startBefore: z.coerce.date().optional(),
  endAfter: z.coerce.date().optional(),
  endBefore: z.coerce.date().optional(),
  relatedTodoId: z.string().cuid('Invalid todo ID format').optional(),
  search: z.string().max(100, 'Search query must be 100 characters or less').optional(),
  sortBy: z.enum(['startAt', 'endAt', 'createdAt', 'title']).default('startAt'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const eventIdParamSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
});

