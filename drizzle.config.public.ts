import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/db/schema/public.ts',
  out: './server/db/migrations/public',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/simple-ai-os',
  },
})
