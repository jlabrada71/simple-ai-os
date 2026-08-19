import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/e2e-api/**/*.test.ts'],
    testTimeout: 20000,
  },
})
