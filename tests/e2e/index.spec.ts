import { test, expect } from '@playwright/test'

test.describe('index page', () => {
  test('renders the headline', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Simple AI OS', exact: true })).toBeVisible()
  })

  test('Open Chat navigates to /chat-streaming', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Open Chat' }).click()
    await expect(page).toHaveURL(/\/chat-streaming$/)
  })

  test('Manage Library navigates to /prompts', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Manage Library' }).click()
    await expect(page).toHaveURL(/\/prompts$/)
  })
})
