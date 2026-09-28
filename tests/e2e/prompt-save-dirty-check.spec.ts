import { test, expect } from '@playwright/test'

test.describe('Edit Prompt Save button', () => {
  test('stays disabled until a field actually changes', async ({ page }) => {
    const promptName = `save-dirty-verify-${Date.now()}`

    await page.goto('/prompts/new')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Name').fill(promptName)
    await page.getByLabel('Content').fill('Original content')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page).toHaveURL(/\/prompts$/)
    await page.waitForLoadState('networkidle')

    await page.locator('tr', { hasText: promptName }).getByRole('link', { name: 'Edit' }).click()
    await expect(page.getByLabel('Name')).toHaveValue(promptName)

    const saveButton = page.getByRole('button', { name: 'Save' })
    await expect(saveButton).toBeDisabled()

    await page.getByLabel('Content').fill('Original content!')
    await expect(saveButton).toBeEnabled()

    await page.getByLabel('Content').fill('Original content')
    await expect(saveButton).toBeDisabled()
  })
})
