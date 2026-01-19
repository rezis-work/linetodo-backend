import { z } from 'zod';

const isTest = process.env.NODE_ENV === 'test';

const envSchema = z.object({
  DATABASE_URL: isTest
    ? z.string().url().optional().or(z.literal(''))
    : z.string().url(),
  DATABASE_URL_DIRECT: z.string().url().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    const parsed = envSchema.parse(process.env);
    // In test mode, provide a default empty string if DATABASE_URL is not set
    if (isTest && !parsed.DATABASE_URL) {
      parsed.DATABASE_URL = '';
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

