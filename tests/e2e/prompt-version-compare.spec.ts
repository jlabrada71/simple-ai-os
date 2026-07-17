import { test, expect } from '@playwright/test'

test.describe('prompt version compare', () => {
  test('shows a content/description/variables diff against a selected past version', async ({ page }) => {
    const promptName = `compare-verify-${Date.now()}`

    await page.goto('/prompts/new')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Name').fill(promptName)
    await page.getByLabel('Content').fill('The quick brown fox jumps over the lazy dog')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page).toHaveURL(/\/prompts$/)
    await page.waitForLoadState('networkidle')

    await page.locator('tr', { hasText: promptName }).getByRole('link', { name: 'Edit' }).click()
    await expect(page.getByLabel('Name')).toHaveValue(promptName)

    // Create version 2 so version 1 lands in history.
    await page.getByLabel('Content').fill('The quick brown fox leaps over the lazy dog and cat')
    await page.getByLabel('Variables (comma-separated)').fill('animal, action')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/prompts$/)
    await page.waitForLoadState('networkidle')

    await page.locator('tr', { hasText: promptName }).getByRole('link', { name: 'Edit' }).click()
    await expect(page.getByLabel('Name')).toHaveValue(promptName)

    await page.getByText('Compare with a previous version').click()
    await page.getByLabel('Compare version').selectOption({ index: 1 })

    await expect(page.locator('.diff-title')).toHaveCount(3)
    await expect(page.locator('.diff-section')).toContainText('jumps')
    await expect(page.locator('.diff-section')).toContainText('leaps')
    await expect(page.locator('.diff-chip')).toHaveCount(2)
  })
})
