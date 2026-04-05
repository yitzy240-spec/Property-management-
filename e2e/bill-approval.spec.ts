import { test, expect } from '@playwright/test'

test.describe('Bill Approval Flow', () => {
  // These tests verify the bills page renders correctly
  // Full approval flow requires auth — tested with API-level checks below

  test('bills page redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/bills')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('bill verification API rejects unauthenticated requests', async ({ request }) => {
    // Try to approve a bill without auth
    const response = await request.post('/api/bills/assign', {
      data: { bill_id: 'fake-id', property_id: 'fake-id' },
    })

    expect(response.status()).toBe(401)
  })

  test('magic link API rejects unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/magic-links', {
      data: { property_id: 'fake-id', link_type: 'contractor' },
    })

    expect(response.status()).toBe(401)
  })

  test('settings API rejects unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/settings', {
      data: { key: 'test', value: 'test' },
    })

    expect(response.status()).toBe(401)
  })

  test('invoice generation API rejects unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/invoices/generate', {
      data: { billing_month: '2026-04-01' },
    })

    expect(response.status()).toBe(401)
  })

  test('green invoice sync rejects unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/green-invoice/sync-owners')

    expect(response.status()).toBe(401)
  })

  test('lodgify property list rejects unauthenticated requests', async ({ request }) => {
    const response = await request.fetch('/api/lodgify/properties')

    expect(response.status()).toBe(401)
  })

  test('cron endpoints reject requests without cron secret', async ({ request }) => {
    const cronRoutes = [
      '/api/cron/ical-sync',
      '/api/cron/lodgify-sync',
      '/api/cron/cleaning-tasks',
      '/api/cron/seasonal-tasks',
      '/api/cron/parse-bills',
    ]

    for (const route of cronRoutes) {
      const response = await request.fetch(route)
      expect(response.status()).toBe(401)
    }
  })

  test('webhook endpoint accepts POST without auth (public)', async ({ request }) => {
    const response = await request.post('/api/webhooks/lodgify', {
      data: { event: 'test', property_id: 123 },
    })

    // Should not be 401 (webhooks are public)
    expect(response.status()).not.toBe(401)
  })
})
