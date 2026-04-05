import { test, expect } from '@playwright/test'

test.describe('Login Page', () => {
  test('renders login page with admin and owner tabs', async ({ page }) => {
    await page.goto('/login')

    // Logo and branding
    await expect(page.getByText('ApartmentOS')).toBeVisible()
    await expect(page.getByText('Marcus Properties')).toBeVisible()

    // Both tabs visible
    await expect(page.getByRole('button', { name: 'Admin' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Owner' })).toBeVisible()
  })

  test('admin tab shows email and password fields', async ({ page }) => {
    await page.goto('/login')

    // Admin tab should be active by default
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  })

  test('owner tab shows email field and magic link info', async ({ page }) => {
    await page.goto('/login')

    // Switch to owner tab
    await page.getByRole('button', { name: 'Owner' }).click()

    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByText('login link')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send Login Link' })).toBeVisible()

    // Password field should NOT be visible
    await expect(page.getByLabel('Password')).not.toBeVisible()
  })

  test('admin login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('invalid@test.com')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign In' }).click()

    // Should show an error message (Supabase returns "Invalid login credentials")
    await expect(page.getByText(/invalid|error|failed/i)).toBeVisible({ timeout: 10000 })
  })

  test('protected routes redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/login')

    // Card should be visible and not overflow
    await expect(page.getByText('ApartmentOS')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  })
})
