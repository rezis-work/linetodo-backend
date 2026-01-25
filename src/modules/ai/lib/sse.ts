import { Response } from 'express';
import type { SSEEvent } from '../types.js';

/**
 * Initialize SSE response headers
 */
export function initSSE(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
}

/**
 * Send SSE event to client
 */
export function sendSSE(res: Response, event: SSEEvent): void {
  const data = JSON.stringify(event);
  res.write(`data: ${data}\n\n`);
}

/**
 * Send SSE error and close connection
 */
export function sendSSEError(res: Response, error: string): void {
  sendSSE(res, { type: 'error', error });
  res.end();
}

/**
 * Close SSE connection
 */
export function endSSE(res: Response): void {
  res.end();
}

