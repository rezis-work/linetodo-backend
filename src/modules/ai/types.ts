export interface ChatMessageInput {
  message: string;
}

export interface ChatMessageResponse {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface ChatHistoryResponse {
  sessionId: string;
  chatType: 'TASK' | 'GLOBAL';
  todoId: string | null;
  messages: ChatMessageResponse[];
}

export interface AIChatResponse {
  message: ChatMessageResponse;
  sessionId: string;
}

export interface TaskContext {
  todo: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueAt: Date | null;
    createdAt: Date;
  };
  comments: Array<{
    body: string;
    authorName: string | null;
    createdAt: Date;
  }>;
  relatedEvents: Array<{
    title: string;
    startAt: Date;
    endAt: Date;
  }>;
}

export interface GlobalUserContext {
  user: {
    name: string | null;
    email: string;
    createdAt: Date;
  };
  stats: {
    totalTodos: number;
    completedTodos: number;
    inProgressTodos: number;
    overdueTodos: number;
    completionRate: number;
  };
  recentTodos: Array<{
    title: string;
    status: string;
    priority: string;
    dueAt: Date | null;
  }>;
  upcomingDeadlines: Array<{
    title: string;
    dueAt: Date;
    priority: string;
  }>;
}

export interface VectorMetadata {
  type: 'TODO' | 'COMMENT' | 'CALENDAR_EVENT';
  sourceId: string;
  workspaceId: string;
  userId?: string;
  [key: string]: unknown;
}

// SSE Event Types
export type SSEEventType = 'start' | 'token' | 'done' | 'error';

export interface SSEStartEvent {
  type: 'start';
  sessionId: string;
}

export interface SSETokenEvent {
  type: 'token';
  content: string;
}

export interface SSEDoneEvent {
  type: 'done';
  message: ChatMessageResponse;
}

export interface SSEErrorEvent {
  type: 'error';
  error: string;
}

export type SSEEvent = SSEStartEvent | SSETokenEvent | SSEDoneEvent | SSEErrorEvent;

