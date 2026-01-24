import { defineConfig } from 'vitest/config';

// Build env object conditionally
const testEnv: Record<string, string> = {
  DATABASE_URL:
    process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '',
  NODE_ENV: 'test',
  PORT: '3000',
};

// Only set TEST_DATABASE_URL if it's provided (not empty)
if (process.env.TEST_DATABASE_URL) {
  testEnv.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Run tests sequentially to avoid database conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    maxConcurrency: 1,
    // Ensure test files also run sequentially
    fileParallelism: false,
    sequence: {
      shuffle: false,
    },
    env: testEnv,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
  },
});

