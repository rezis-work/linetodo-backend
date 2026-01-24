export interface CreateCalendarEventInput {
  title: string;
  startAt: Date;
  endAt: Date;
  relatedTodoId?: string;
}

export interface UpdateCalendarEventInput {
  title?: string;
  startAt?: Date;
  endAt?: Date;
  relatedTodoId?: string | null;
}

export interface CalendarEventFilters {
  startAfter?: Date;
  startBefore?: Date;
  endAfter?: Date;
  endBefore?: Date;
  relatedTodoId?: string;
  search?: string;
  sortBy?: 'startAt' | 'endAt' | 'createdAt' | 'title';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CalendarEventResponse {
  id: string;
  workspaceId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  relatedTodoId: string | null;
  createdAt: Date;
  updatedAt: Date;
  relatedTodo: {
    id: string;
    title: string;
    status: string;
    priority: string;
  } | null;
}

export interface CalendarEventListResponse {
  events: CalendarEventResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CalendarStats {
  total: number;
  todayCount: number;
  thisWeekCount: number;
  thisMonthCount: number;
  linkedToTodos: number;
}

