import OpenAI from 'openai';
import { env } from '../../../config/env.js';

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function generateChatCompletion(
  messages: ChatMessage[],
  options?: { maxTokens?: number }
): Promise<string> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
    max_tokens: options?.maxTokens || 1000,
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return content;
}

// NEW: Streaming function
export async function* generateChatCompletionStream(
  messages: ChatMessage[],
  options?: { maxTokens?: number }
): AsyncGenerator<string, void, unknown> {
  const client = getClient();

  const stream = await client.chat.completions.create({
    model: env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
    max_tokens: options?.maxTokens || 1000,
    temperature: 0.7,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

