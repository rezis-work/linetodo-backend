import { beforeAll, afterAll } from 'vitest';
import { disconnectDatabase } from './helpers/db.js';

// Clean up database before all tests
beforeAll(async () => {
  // Database is ready
  // Note: Each test file handles its own cleanup in beforeEach/afterEach
});

// Disconnect after all tests
afterAll(async () => {
  await disconnectDatabase();
});

