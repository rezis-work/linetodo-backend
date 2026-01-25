import { Index } from '@upstash/vector';
import { env } from '../../../config/env.js';
import type { VectorMetadata } from '../types.js';

let vectorIndex: Index | null = null;

function getIndex(): Index {
  if (!vectorIndex) {
    if (!env.UPSTASH_VECTOR_REST_URL || !env.UPSTASH_VECTOR_REST_TOKEN) {
      throw new Error('Upstash Vector credentials not configured');
    }
    vectorIndex = new Index({
      url: env.UPSTASH_VECTOR_REST_URL,
      token: env.UPSTASH_VECTOR_REST_TOKEN,
    });
  }
  return vectorIndex;
}

/**
 * Upsert content - Upstash generates embedding automatically
 */
export async function upsertContent(
  id: string,
  content: string,
  metadata: VectorMetadata
): Promise<void> {
  const index = getIndex();
  await index.upsert({
    id,
    data: content,
    metadata,
  });
}

/**
 * Search similar content - Upstash embeds query automatically
 */
export async function searchSimilar(
  query: string,
  topK: number = 5,
  filter?: string
): Promise<Array<{ id: string; score: number; metadata?: VectorMetadata }>> {
  const index = getIndex();
  const results = await index.query({
    data: query,
    topK,
    filter,
    includeMetadata: true,
  });

  return results.map((r) => ({
    id: r.id,
    score: r.score,
    metadata: r.metadata as VectorMetadata | undefined,
  }));
}

/**
 * Delete a vector by ID
 */
export async function deleteVector(id: string): Promise<void> {
  const index = getIndex();
  await index.delete(id);
}

/**
 * Delete multiple vectors by IDs
 */
export async function deleteVectors(ids: string[]): Promise<void> {
  const index = getIndex();
  await index.delete(ids);
}

