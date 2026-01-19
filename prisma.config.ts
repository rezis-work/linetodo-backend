import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

type Env = {
  DATABASE_URL: string;
  DATABASE_URL_DIRECT?: string;
};

// Get DATABASE_URL_DIRECT if available, otherwise fallback to DATABASE_URL
const databaseUrl =
  process.env.DATABASE_URL_DIRECT || env<Env>('DATABASE_URL');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: databaseUrl,
  },
});

