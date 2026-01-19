# Test Setup

This directory contains tests for the backend application.

## Test Database Setup

Tests use a separate test database to avoid affecting development data. You can configure the test database URL using the `TEST_DATABASE_URL` environment variable.

### Option 1: Use Neon Test Database (Recommended)

Create a separate Neon database for testing and add to your `.env` file:

```env
TEST_DATABASE_URL="postgresql://user:password@host:5432/test_db?sslmode=require"
```

### Option 2: Use Default Test Database

If `TEST_DATABASE_URL` is not set, tests will use:
```
postgresql://test:test@localhost:5432/test_db
```

Make sure you have a local PostgreSQL instance running with this database.

## Running Tests

```bash
# Run all tests
pnpm test

# Run only database tests
pnpm test:db

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Test Structure

- `helpers/db.ts` - Database utilities for tests (Prisma client, cleanup functions)
- `setup.ts` - Global test setup (runs before/after all tests)
- `db.test.ts` - Database model tests
- `health.test.ts` - API health check tests

## Database Cleanup

Tests automatically clean up the database:
- After each test: All tables are truncated
- After all tests: Database connection is closed

This ensures tests don't interfere with each other and leave the database in a clean state.

