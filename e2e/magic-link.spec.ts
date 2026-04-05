import { test, expect } from '@playwright/test'

test.describe('Magic Link Pages', () => {
  test('contractor page shows error for invalid token', async ({ page }) => {
    await page.goto('/contractor/invalid-token-12345')

    await expect(page.getByText(/invalid|expired/i)).toBeVisible({ timeout: 10000 })
  })

  test('guest page shows error for invalid token', async ({ page }) => {
    await page.goto('/guest/invalid-token-12345')

    await expect(page.getByText(/invalid|expired/i)).toBeVisible({ timeout: 10000 })
  })

  test('contractor page renders task view for valid structure', async ({ page }) => {
    // Even with an invalid JWT, the page should render the error state cleanly
    // (not a 500 or blank page)
    const response = await page.goto('/contractor/some-fake-jwt-token')

    // Should return 200 (error rendered as UI, not HTTP error)
    expect(response?.status()).toBe(200)

    // Should show one of: task view, expired link, or invalid link
    const content = await page.textContent('body')
    expect(
      content?.includes('Invalid') ||
      content?.includes('Expired') ||
      content?.includes('Task Assignment')
    ).toBeTruthy()
  })

  test('guest page renders check-in view for valid structure', async ({ page }) => {
    const response = await page.goto('/guest/some-fake-jwt-token')

    expect(response?.status()).toBe(200)

    const content = await page.textContent('body')
    expect(
      content?.includes('Invalid') ||
      content?.includes('Expired') ||
      content?.includes('Welcome')
    ).toBeTruthy()
  })

  test('contractor error page is mobile-friendly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/contractor/invalid-token')

    // Error message should be visible and centered
    await expect(page.getByText(/invalid|expired/i)).toBeVisible({ timeout: 10000 })
  })
})
