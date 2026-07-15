import { test, expect } from '@playwright/test'

test.describe('prompts pages', () => {
  test('creates, edits, and deletes a prompt', async ({ page }) => {
    const promptName = `e2e-test-prompt-${Date.now()}`

    await page.goto('/prompts')
    await page.waitForLoadState('networkidle')
    await page.getByRole('link', { name: 'New Prompt' }).click()
    await expect(page).toHaveURL(/\/prompts\/new$/)
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Name').fill(promptName)
    await page.getByLabel('Content').fill('Say hello to {{name}}.')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page).toHaveURL(/\/prompts$/)
    await page.waitForLoadState('networkidle')

    const row = page.locator('tr', { hasText: promptName })
    await expect(row).toBeVisible()

    await row.getByRole('link', { name: 'Edit' }).click()
    await expect(page).toHaveURL(/\/prompts\/.+/)
    // The edit page fetches the prompt asynchronously and overwrites the form fields
    // once it resolves, so wait for that fetch to land before typing into the form.
    await expect(page.getByLabel('Name')).toHaveValue(promptName)
    await page.getByLabel('Description').fill('Updated description')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/prompts$/)
    await page.waitForLoadState('networkidle')

    const updatedRow = page.locator('tr', { hasText: promptName })
    await expect(updatedRow).toContainText('Updated description')

    page.once('dialog', (dialog) => dialog.accept())
    await updatedRow.getByRole('button', { name: 'Delete' }).click()
    await expect(page.locator('tr', { hasText: promptName })).toHaveCount(0)
  })
})
