import { prisma } from '../../lib/prisma.js';
import { Prisma } from '@prisma/client';
import type {
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  CalendarEventFilters,
  CalendarEventResponse,
  CalendarEventListResponse,
  CalendarStats,
} from './types.js';

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
 * Verify todo belongs to the workspace
 */
async function verifyTodoBelongsToWorkspace(workspaceId: string, todoId: string): Promise<void> {
  const todo = await prisma.todo.findFirst({
    where: {
      id: todoId,
      workspaceId,
    },
  });

  if (!todo) {
    const error = new Error('Todo not found in this workspace') as Error & {
      statusCode: number;
    };
    error.statusCode = 400;
    throw error;
  }
}

/**
 * Transform database event to response format
 */
function toEventResponse(event: any): CalendarEventResponse {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    relatedTodoId: event.relatedTodoId,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    relatedTodo: event.relatedTodo
      ? {
          id: event.relatedTodo.id,
          title: event.relatedTodo.title,
          status: event.relatedTodo.status,
          priority: event.relatedTodo.priority,
        }
      : null,
  };
}

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(
  workspaceId: string,
  userId: string,
  input: CreateCalendarEventInput
): Promise<CalendarEventResponse> {
  await verifyWorkspaceMembership(workspaceId, userId);

  // Verify todo belongs to workspace if provided
  if (input.relatedTodoId) {
    await verifyTodoBelongsToWorkspace(workspaceId, input.relatedTodoId);
  }

  const event = await prisma.calendarEvent.create({
    data: {
      workspaceId,
      title: input.title,
      startAt: input.startAt,
      endAt: input.endAt,
      relatedTodoId: input.relatedTodoId,
    },
    include: {
      relatedTodo: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
        },
      },
    },
  });

  return toEventResponse(event);
}

/**
 * Get calendar events with filtering and pagination
 */
export async function getCalendarEvents(
  workspaceId: string,
  userId: string,
  filters: CalendarEventFilters
): Promise<CalendarEventListResponse> {
  await verifyWorkspaceMembership(workspaceId, userId);

  const where: Prisma.CalendarEventWhereInput = {
    workspaceId,
  };

  // Date filters
  if (filters.startAfter || filters.startBefore) {
    where.startAt = {};
    if (filters.startAfter) where.startAt.gte = filters.startAfter;
    if (filters.startBefore) where.startAt.lte = filters.startBefore;
  }

  if (filters.endAfter || filters.endBefore) {
    where.endAt = {};
    if (filters.endAfter) where.endAt.gte = filters.endAfter;
    if (filters.endBefore) where.endAt.lte = filters.endBefore;
  }

  // Related todo filter
  if (filters.relatedTodoId) {
    where.relatedTodoId = filters.relatedTodoId;
  }

  // Search filter
  if (filters.search) {
    where.title = { contains: filters.search, mode: 'insensitive' };
  }

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const skip = (page - 1) * limit;

  // Sorting
  const orderBy: Prisma.CalendarEventOrderByWithRelationInput = {
    [filters.sortBy || 'startAt']: filters.sortOrder || 'asc',
  };

  const [events, total] = await Promise.all([
    prisma.calendarEvent.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        relatedTodo: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    }),
    prisma.calendarEvent.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    events: events.map(toEventResponse),
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Get calendar event by ID
 */
export async function getCalendarEventById(
  workspaceId: string,
  eventId: string,
  userId: string
): Promise<CalendarEventResponse> {
  await verifyWorkspaceMembership(workspaceId, userId);

  const event = await prisma.calendarEvent.findFirst({
    where: {
      id: eventId,
      workspaceId,
    },
    include: {
      relatedTodo: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
        },
      },
    },
  });

  if (!event) {
    const error = new Error('Calendar event not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  return toEventResponse(event);
}

/**
 * Update calendar event
 */
export async function updateCalendarEvent(
  workspaceId: string,
  eventId: string,
  userId: string,
  input: UpdateCalendarEventInput
): Promise<CalendarEventResponse> {
  await verifyWorkspaceMembership(workspaceId, userId);

  const existingEvent = await prisma.calendarEvent.findFirst({
    where: { id: eventId, workspaceId },
  });

  if (!existingEvent) {
    const error = new Error('Calendar event not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  // Verify todo belongs to workspace if changing relatedTodoId
  if (input.relatedTodoId !== undefined && input.relatedTodoId !== null) {
    await verifyTodoBelongsToWorkspace(workspaceId, input.relatedTodoId);
  }

  // Validate date range if both dates are being updated
  const newStartAt = input.startAt || existingEvent.startAt;
  const newEndAt = input.endAt || existingEvent.endAt;
  if (newEndAt < newStartAt) {
    const error = new Error('End date must be after or equal to start date') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const event = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      title: input.title,
      startAt: input.startAt,
      endAt: input.endAt,
      relatedTodoId: input.relatedTodoId,
    },
    include: {
      relatedTodo: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
        },
      },
    },
  });

  return toEventResponse(event);
}

/**
 * Delete calendar event
 */
export async function deleteCalendarEvent(
  workspaceId: string,
  eventId: string,
  userId: string
): Promise<void> {
  await verifyWorkspaceMembership(workspaceId, userId);

  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, workspaceId },
  });

  if (!event) {
    const error = new Error('Calendar event not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  await prisma.calendarEvent.delete({
    where: { id: eventId },
  });
}

/**
 * Get calendar statistics
 */
export async function getCalendarStats(
  workspaceId: string,
  userId: string
): Promise<CalendarStats> {
  await verifyWorkspaceMembership(workspaceId, userId);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [total, todayCount, thisWeekCount, thisMonthCount, linkedToTodos] = await Promise.all([
    prisma.calendarEvent.count({ where: { workspaceId } }),
    prisma.calendarEvent.count({
      where: {
        workspaceId,
        startAt: { gte: todayStart, lt: todayEnd },
      },
    }),
    prisma.calendarEvent.count({
      where: {
        workspaceId,
        startAt: { gte: todayStart, lt: weekEnd },
      },
    }),
    prisma.calendarEvent.count({
      where: {
        workspaceId,
        startAt: { gte: todayStart, lt: monthEnd },
      },
    }),
    prisma.calendarEvent.count({
      where: {
        workspaceId,
        relatedTodoId: { not: null },
      },
    }),
  ]);

  return {
    total,
    todayCount,
    thisWeekCount,
    thisMonthCount,
    linkedToTodos,
  };
}

