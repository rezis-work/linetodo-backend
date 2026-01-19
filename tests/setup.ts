import { beforeAll, afterAll, afterEach } from 'vitest';
import { cleanupDatabase, disconnectDatabase, isDatabaseAvailable } from './helpers/db.js';

// Clean up database before all tests
beforeAll(async () => {
  // Database is ready
});

// Clean up database after each test (only if database is available)
afterEach(async () => {
  if (await isDatabaseAvailable()) {
    await cleanupDatabase();
  }
});

// Disconnect after all tests
afterAll(async () => {
  await disconnectDatabase();
});

