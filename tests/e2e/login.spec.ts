import { test, expect } from '@playwright/test'

test('redirects an unauthenticated visitor from /chat to /login', async ({ page, baseURL }) => {
  const url = new URL(baseURL!)
  url.hostname = `e2e-test.${url.hostname}`
  await page.goto(`${url.origin}/chat`)
  await expect(page).toHaveURL(/\/login/)
})
