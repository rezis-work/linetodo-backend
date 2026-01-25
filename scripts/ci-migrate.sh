#!/bin/bash
set -e

# This script runs database migrations in CI with schema isolation support
# Usage: ./scripts/ci-migrate.sh

SCHEMA_NAME="${SCHEMA_NAME:-public}"

echo "Running database migrations..."
echo "Schema: $SCHEMA_NAME"

# Check if schema isolation is being used
if [[ "$DATABASE_URL" == *"schema="* ]]; then
  echo "Schema isolation detected - using db push instead of migrate deploy"
  # For schema isolation, use db push which syncs schema to the isolated schema
  # Note: Prisma client is already generated in previous step
  pnpm prisma db push --accept-data-loss
else
  echo "No schema isolation - using migrate deploy"
  # For normal migrations, use migrate deploy
  pnpm prisma migrate deploy
fi

echo "Database migrations completed successfully"

