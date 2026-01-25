import { prisma } from '../../../lib/prisma.js';
import {
  generateChatCompletion,
  generateChatCompletionStream,
  type ChatMessage,
} from '../lib/openai.js';
import {
  buildTaskContext,
  buildGlobalUserContext,
  buildTaskSystemPrompt,
  buildGlobalSystemPrompt,
} from './context.service.js';
import type {
  AIChatResponse,
  ChatHistoryResponse,
  ChatMessageResponse,
} from '../types.js';

/**
 * Get or create a chat session
 */
async function getOrCreateSession(
  userId: string,
  chatType: 'TASK' | 'GLOBAL',
  todoId?: string
): Promise<string> {
  // For GLOBAL chats, todoId must be explicitly null
  // For TASK chats, todoId must be provided
  if (chatType === 'TASK' && !todoId) {
    const error = new Error('todoId is required for TASK chat sessions') as Error & {
      statusCode: number;
    };
    error.statusCode = 400;
    throw error;
  }
  
  const finalTodoId = chatType === 'GLOBAL' ? null : (todoId ?? null);
  
  try {
    // Use findFirst instead of findUnique for nullable composite keys
    // Prisma's findUnique has issues with nullable fields in composite unique constraints
    const existing = await prisma.chatSession.findFirst({
      where: {
        userId,
        todoId: finalTodoId,
        chatType: chatType as 'TASK' | 'GLOBAL',
      },
    });

    if (existing) {
      return existing.id;
    }

    const session = await prisma.chatSession.create({
      data: {
        userId,
        todoId: finalTodoId,
        chatType: chatType as 'TASK' | 'GLOBAL',
      },
    });

    return session.id;
  } catch (error) {
    // Handle missing table error (P2021) - table doesn't exist (migrations not run)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2021'
    ) {
      const dbError = new Error('Chat service unavailable - database schema not initialized') as Error & {
        statusCode: number;
      };
      dbError.statusCode = 503;
      throw dbError;
    }
    throw error;
  }
}

/**
 * Get recent messages for context
 */
async function getRecentMessages(sessionId: string, limit: number = 10): Promise<ChatMessage[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return messages.reverse().map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
}

/**
 * Save a message to database
 */
async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<{ id: string; createdAt: Date }> {
  try {
    const message = await prisma.chatMessage.create({
      data: {
        sessionId,
        role,
        content,
      },
    });

    // Update session timestamp
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return { id: message.id, createdAt: message.createdAt };
  } catch (error) {
    // Handle missing table error (P2021) - table doesn't exist (migrations not run)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2021'
    ) {
      const dbError = new Error('Chat service unavailable - database schema not initialized') as Error & {
        statusCode: number;
      };
      dbError.statusCode = 503;
      throw dbError;
    }
    throw error;
  }
}

/**
 * Send message in task-specific chat
 */
export async function sendTaskMessage(
  userId: string,
  todoId: string,
  message: string
): Promise<AIChatResponse> {
  // Build context (also validates access)
  const context = await buildTaskContext(todoId, userId);
  const systemPrompt = buildTaskSystemPrompt(context);

  // Get or create session
  const sessionId = await getOrCreateSession(userId, 'TASK', todoId);

  // Get recent messages
  const history = await getRecentMessages(sessionId);

  // Build messages array
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  // Generate AI response
  const aiResponse = await generateChatCompletion(messages);

  // Save user message
  await saveMessage(sessionId, 'user', message);

  // Save AI response
  const saved = await saveMessage(sessionId, 'assistant', aiResponse);

  return {
    sessionId,
    message: {
      id: saved.id,
      role: 'assistant',
      content: aiResponse,
      createdAt: saved.createdAt,
    },
  };
}

/**
 * Send message in global chat
 */
export async function sendGlobalMessage(
  userId: string,
  message: string
): Promise<AIChatResponse> {
  // Build context
  const context = await buildGlobalUserContext(userId);
  const systemPrompt = buildGlobalSystemPrompt(context);

  // Get or create session
  const sessionId = await getOrCreateSession(userId, 'GLOBAL');

  // Get recent messages
  const history = await getRecentMessages(sessionId);

  // Build messages array
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  // Generate AI response
  const aiResponse = await generateChatCompletion(messages);

  // Save user message
  await saveMessage(sessionId, 'user', message);

  // Save AI response
  const saved = await saveMessage(sessionId, 'assistant', aiResponse);

  return {
    sessionId,
    message: {
      id: saved.id,
      role: 'assistant',
      content: aiResponse,
      createdAt: saved.createdAt,
    },
  };
}

/**
 * Get chat history
 */
export async function getChatHistory(
  userId: string,
  chatType: 'TASK' | 'GLOBAL',
  todoId?: string,
  limit: number = 50
): Promise<ChatHistoryResponse | null> {
  // For GLOBAL chats, todoId must be explicitly null
  // For TASK chats, todoId must be provided
  if (chatType === 'TASK' && !todoId) {
    const error = new Error('todoId is required for TASK chat history') as Error & {
      statusCode: number;
    };
    error.statusCode = 400;
    throw error;
  }
  
  const finalTodoId = chatType === 'GLOBAL' ? null : (todoId ?? null);
  
  try {
    // Use findFirst instead of findUnique for nullable composite keys
    // Prisma's findUnique has issues with nullable fields in composite unique constraints
    const session = await prisma.chatSession.findFirst({
      where: {
        userId,
        todoId: finalTodoId,
        chatType: chatType as 'TASK' | 'GLOBAL',
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: limit,
        },
      },
    });

    if (!session) {
      return null;
    }

    // Type assertion needed because Prisma's include type inference can be incomplete
    const sessionWithMessages = session as typeof session & {
      messages: Array<{ id: string; role: string; content: string; createdAt: Date }>;
    };

    return {
      sessionId: sessionWithMessages.id,
      chatType: sessionWithMessages.chatType as 'TASK' | 'GLOBAL',
      todoId: sessionWithMessages.todoId,
      messages: sessionWithMessages.messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        createdAt: m.createdAt,
      })),
    };
  } catch (error) {
    // Handle missing table error (P2021) - table doesn't exist (migrations not run)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2021'
    ) {
      const dbError = new Error('Chat service unavailable - database schema not initialized') as Error & {
        statusCode: number;
      };
      dbError.statusCode = 503;
      throw dbError;
    }
    throw error;
  }
}

/**
 * Clear chat history
 */
export async function clearChatHistory(
  userId: string,
  chatType: 'TASK' | 'GLOBAL',
  todoId?: string
): Promise<void> {
  // For GLOBAL chats, todoId must be explicitly null
  // For TASK chats, todoId must be provided
  if (chatType === 'TASK' && !todoId) {
    const error = new Error('todoId is required for TASK chat history') as Error & {
      statusCode: number;
    };
    error.statusCode = 400;
    throw error;
  }
  
  const finalTodoId = chatType === 'GLOBAL' ? null : (todoId ?? null);
  
  try {
    await prisma.chatSession.deleteMany({
      where: {
        userId,
        todoId: finalTodoId,
        chatType: chatType as 'TASK' | 'GLOBAL',
      },
    });
  } catch (error) {
    // Handle missing table error (P2021) - table doesn't exist (migrations not run)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2021'
    ) {
      const dbError = new Error('Chat service unavailable - database schema not initialized') as Error & {
        statusCode: number;
      };
      dbError.statusCode = 503;
      throw dbError;
    }
    throw error;
  }
}

/**
 * Stream task message - returns async generator
 */
export async function* streamTaskMessage(
  userId: string,
  todoId: string,
  message: string
): AsyncGenerator<
  | { type: 'start'; sessionId: string }
  | { type: 'token'; content: string }
  | { type: 'done'; message: ChatMessageResponse },
  void,
  unknown
> {
  // Build context (also validates access)
  const context = await buildTaskContext(todoId, userId);
  const systemPrompt = buildTaskSystemPrompt(context);

  // Get or create session
  const sessionId = await getOrCreateSession(userId, 'TASK', todoId);

  // Emit start event
  yield { type: 'start', sessionId };

  // Get recent messages
  const history = await getRecentMessages(sessionId);

  // Build messages array
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  // Save user message first
  await saveMessage(sessionId, 'user', message);

  // Collect full response while streaming
  let fullResponse = '';

  // Stream tokens
  for await (const token of generateChatCompletionStream(messages)) {
    fullResponse += token;
    yield { type: 'token', content: token };
  }

  // Save AI response after streaming completes
  const saved = await saveMessage(sessionId, 'assistant', fullResponse);

  // Emit done event with full message
  yield {
    type: 'done',
    message: {
      id: saved.id,
      role: 'assistant',
      content: fullResponse,
      createdAt: saved.createdAt,
    },
  };
}

/**
 * Stream global message - returns async generator
 */
export async function* streamGlobalMessage(
  userId: string,
  message: string
): AsyncGenerator<
  | { type: 'start'; sessionId: string }
  | { type: 'token'; content: string }
  | { type: 'done'; message: ChatMessageResponse },
  void,
  unknown
> {
  // Build context
  const context = await buildGlobalUserContext(userId);
  const systemPrompt = buildGlobalSystemPrompt(context);

  // Get or create session
  const sessionId = await getOrCreateSession(userId, 'GLOBAL');

  // Emit start event
  yield { type: 'start', sessionId };

  // Get recent messages
  const history = await getRecentMessages(sessionId);

  // Build messages array
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  // Save user message first
  await saveMessage(sessionId, 'user', message);

  // Collect full response while streaming
  let fullResponse = '';

  // Stream tokens
  for await (const token of generateChatCompletionStream(messages)) {
    fullResponse += token;
    yield { type: 'token', content: token };
  }

  // Save AI response after streaming completes
  const saved = await saveMessage(sessionId, 'assistant', fullResponse);

  // Emit done event with full message
  yield {
    type: 'done',
    message: {
      id: saved.id,
      role: 'assistant',
      content: fullResponse,
      createdAt: saved.createdAt,
    },
  };
}

