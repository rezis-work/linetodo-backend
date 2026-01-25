import { prisma } from '../../../lib/prisma.js';
import { upsertContent, deleteVector } from '../lib/vector.js';

/**
 * Embed a todo (title + description + comments)
 */
export async function embedTodo(todoId: string): Promise<void> {
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    include: {
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      workspace: { select: { id: true } },
    },
  });

  if (!todo) return;

  // Combine content
  const contentParts = [
    `Task: ${todo.title}`,
    todo.description ? `Description: ${todo.description}` : '',
    todo.comments.length > 0
      ? `Comments: ${todo.comments.map((c) => c.body).join(' | ')}`
      : '',
  ];
  const content = contentParts.filter(Boolean).join('\n');

  const vectorId = `todo:${todoId}`;

  // Upsert to Upstash (auto-embeds) - handle errors gracefully
  try {
    await upsertContent(vectorId, content, {
      type: 'TODO',
      sourceId: todoId,
      workspaceId: todo.workspaceId,
      status: todo.status,
      priority: todo.priority,
    });
  } catch (error) {
    // Log but don't fail if vector service is unavailable
    console.warn('Failed to embed todo:', error);
  }

  // Track in database
  await prisma.embeddingItem.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: 'TODO',
        sourceId: todoId,
      },
    },
    create: {
      sourceType: 'TODO',
      sourceId: todoId,
      workspaceId: todo.workspaceId,
      upstashVectorId: vectorId,
    },
    update: {
      updatedAt: new Date(),
    },
  });
}

/**
 * Delete todo embedding
 */
export async function deleteTodoEmbedding(todoId: string): Promise<void> {
  const vectorId = `todo:${todoId}`;

  try {
    await deleteVector(vectorId);
  } catch (error) {
    // Ignore if doesn't exist
  }

  await prisma.embeddingItem.deleteMany({
    where: {
      sourceType: 'TODO',
      sourceId: todoId,
    },
  });
}

/**
 * Sync all todos for a workspace
 */
export async function syncWorkspaceEmbeddings(workspaceId: string): Promise<number> {
  const todos = await prisma.todo.findMany({
    where: { workspaceId },
    select: { id: true },
  });

  for (const todo of todos) {
    await embedTodo(todo.id);
  }

  return todos.length;
}

