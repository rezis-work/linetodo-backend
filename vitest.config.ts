import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Run tests sequentially to avoid database conflicts
    threads: false,
    maxConcurrency: 1,
    env: {
      // Use TEST_DATABASE_URL if provided, otherwise use DATABASE_URL from .env
      // If neither is set, tests will skip database operations
      DATABASE_URL:
        process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '',
      NODE_ENV: 'test',
      PORT: '3000',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
  },
});

