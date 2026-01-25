import { z } from 'zod';

const isTest = process.env.NODE_ENV === 'test';

const envSchema = z.object({
  DATABASE_URL: isTest
    ? z.string().url().optional().or(z.literal(''))
    : z.string().url(),
  TEST_DATABASE_URL: isTest
    ? z.string().url().optional().or(z.literal(''))
    : z.string().url().optional(),
  DATABASE_URL_DIRECT: z.string().url().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: isTest ? z.string().optional() : z.string().min(32),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  JWT_ACCESS_TOKEN_EXPIRY: z.string().default('1h'),
  JWT_REFRESH_TOKEN_EXPIRY: z.string().default('30d'),
  OPENAI_API_KEY: isTest ? z.string().optional() : z.string().min(1),
  UPSTASH_VECTOR_REST_URL: isTest ? z.string().url().optional() : z.string().url(),
  UPSTASH_VECTOR_REST_TOKEN: isTest ? z.string().optional() : z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    const parsed = envSchema.parse(process.env);
    // In test mode, provide defaults if not set
    if (isTest) {
      if (!parsed.DATABASE_URL) {
        parsed.DATABASE_URL = '';
      }
      if (!parsed.JWT_SECRET) {
        parsed.JWT_SECRET = 'test-secret-key-for-testing-purposes-only-min-32-chars';
      }
      if (!parsed.OPENAI_API_KEY) {
        parsed.OPENAI_API_KEY = '';
      }
      if (!parsed.UPSTASH_VECTOR_REST_URL) {
        parsed.UPSTASH_VECTOR_REST_URL = '';
      }
      if (!parsed.UPSTASH_VECTOR_REST_TOKEN) {
        parsed.UPSTASH_VECTOR_REST_TOKEN = '';
      }
    }
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Invalid environment variables:\n${missingVars}`);
    }
    throw error;
  }
}

export const env = validateEnv();

