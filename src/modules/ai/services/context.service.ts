import { prisma } from '../../../lib/prisma.js';
import type { TaskContext, GlobalUserContext } from '../types.js';

/**
 * Build context for task-specific chat
 */
export async function buildTaskContext(
  todoId: string,
  userId: string
): Promise<TaskContext> {
  const todo = await prisma.todo.findFirst({
    where: { id: todoId },
    include: {
      workspace: {
        include: {
          members: { where: { userId } },
        },
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          author: { select: { name: true } },
        },
      },
      calendarEvents: {
        orderBy: { startAt: 'asc' },
        take: 5,
      },
    },
  });

  if (!todo) {
    const error = new Error('Todo not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  // Check access
  if (todo.workspace.members.length === 0) {
    const error = new Error('Access denied') as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }

  return {
    todo: {
      id: todo.id,
      title: todo.title,
      description: todo.description,
      status: todo.status,
      priority: todo.priority,
      dueAt: todo.dueAt,
      createdAt: todo.createdAt,
    },
    comments: todo.comments.map((c) => ({
      body: c.body,
      authorName: c.author.name,
      createdAt: c.createdAt,
    })),
    relatedEvents: todo.calendarEvents.map((e) => ({
      title: e.title,
      startAt: e.startAt,
      endAt: e.endAt,
    })),
  };
}

/**
 * Build context for global user chat
 */
export async function buildGlobalUserContext(userId: string): Promise<GlobalUserContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      createdAt: true,
    },
  });

  if (!user) {
    const error = new Error('User not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Get user's workspaces
  const workspaceIds = await prisma.workspaceMember
    .findMany({
      where: { userId },
      select: { workspaceId: true },
    })
    .then((m) => m.map((w) => w.workspaceId));

  // Stats
  const [totalTodos, completedTodos, inProgressTodos, overdueTodos] = await Promise.all([
    prisma.todo.count({
      where: { workspaceId: { in: workspaceIds } },
    }),
    prisma.todo.count({
      where: { workspaceId: { in: workspaceIds }, status: 'DONE' },
    }),
    prisma.todo.count({
      where: { workspaceId: { in: workspaceIds }, status: 'IN_PROGRESS' },
    }),
    prisma.todo.count({
      where: {
        workspaceId: { in: workspaceIds },
        status: { notIn: ['DONE', 'CANCELLED'] },
        dueAt: { lt: now },
      },
    }),
  ]);

  // Recent todos
  const recentTodos = await prisma.todo.findMany({
    where: { workspaceId: { in: workspaceIds } },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: {
      title: true,
      status: true,
      priority: true,
      dueAt: true,
    },
  });

  // Upcoming deadlines
  const upcomingDeadlines = await prisma.todo.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      status: { notIn: ['DONE', 'CANCELLED'] },
      dueAt: { gte: now, lte: sevenDaysFromNow },
    },
    orderBy: { dueAt: 'asc' },
    take: 10,
    select: {
      title: true,
      dueAt: true,
      priority: true,
    },
  });

  const completionRate = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

  return {
    user: {
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    },
    stats: {
      totalTodos,
      completedTodos,
      inProgressTodos,
      overdueTodos,
      completionRate,
    },
    recentTodos,
    upcomingDeadlines: upcomingDeadlines.map((t) => ({
      title: t.title,
      dueAt: t.dueAt!,
      priority: t.priority,
    })),
  };
}

/**
 * Build system prompt for task chat
 */
export function buildTaskSystemPrompt(context: TaskContext): string {
  const comments = context.comments.length > 0
    ? context.comments
        .map((c) => `- ${c.authorName || 'User'}: "${c.body}"`)
        .join('\n')
    : 'No comments yet.';

  const events = context.relatedEvents.length > 0
    ? context.relatedEvents
        .map((e) => `- ${e.title} (${e.startAt.toLocaleDateString()} - ${e.endAt.toLocaleDateString()})`)
        .join('\n')
    : 'No related events.';

  return `You are a helpful AI assistant for a task management app. You are helping the user with a specific task.

TASK DETAILS:
- Title: ${context.todo.title}
- Description: ${context.todo.description || 'No description'}
- Status: ${context.todo.status}
- Priority: ${context.todo.priority}
- Due: ${context.todo.dueAt ? context.todo.dueAt.toLocaleDateString() : 'No due date'}
- Created: ${context.todo.createdAt.toLocaleDateString()}

RECENT COMMENTS:
${comments}

RELATED CALENDAR EVENTS:
${events}

Help the user with questions about this task. Offer suggestions for completing it, breaking it down, or improving it. Be concise, practical, and actionable.`;
}

/**
 * Build system prompt for global chat
 */
export function buildGlobalSystemPrompt(context: GlobalUserContext): string {
  const recent = context.recentTodos.length > 0
    ? context.recentTodos
        .map((t) => `- ${t.title} [${t.status}] (${t.priority})`)
        .join('\n')
    : 'No recent tasks.';

  const upcoming = context.upcomingDeadlines.length > 0
    ? context.upcomingDeadlines
        .map((t) => `- ${t.title} - Due: ${t.dueAt.toLocaleDateString()} (${t.priority})`)
        .join('\n')
    : 'No upcoming deadlines.';

  return `You are a helpful AI productivity assistant. You have context about the user's task management activity.

USER PROFILE:
- Name: ${context.user.name || 'User'}
- Member since: ${context.user.createdAt.toLocaleDateString()}

PRODUCTIVITY STATS:
- Total tasks: ${context.stats.totalTodos}
- Completed: ${context.stats.completedTodos} (${context.stats.completionRate}%)
- In Progress: ${context.stats.inProgressTodos}
- Overdue: ${context.stats.overdueTodos}

RECENT TASKS:
${recent}

UPCOMING DEADLINES (Next 7 days):
${upcoming}

Help the user with productivity tips, task prioritization, goal setting, and general task management advice. Be encouraging, specific, and actionable.`;
}

