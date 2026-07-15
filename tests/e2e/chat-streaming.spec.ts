import { test, expect } from '@playwright/test'

test.describe('chat-streaming page', () => {
  test('sends a free-text message and receives a streamed reply', async ({ page }) => {
    await page.goto('/chat-streaming')
    await page.waitForLoadState('networkidle')

    const textarea = page.getByPlaceholder('Type your message...')
    await textarea.fill('What is 2 + 2?')
    await page.getByRole('button', { name: 'Send message' }).click()

    await expect(page.locator('.bubble-user').last()).toHaveText('What is 2 + 2?')
    await expect(page.locator('.bubble-assistant').last()).not.toHaveText('', { timeout: 15000 })
  })
})
