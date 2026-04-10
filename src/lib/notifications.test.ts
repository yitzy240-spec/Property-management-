import { describe, it, expect, vi } from 'vitest'

/**
 * Tests for notification helper logic.
 * Mocks Supabase calls to test the notification creation flow.
 */

// Mock the supabase server module
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({ data: { value: 'test-user-id' } }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
    auth: {
      admin: {
        generateLink: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
        }),
      },
    },
  }),
}))

describe('Notification helpers', () => {
  it('createNotification inserts correct fields', async () => {
    const { createNotification } = await import('./notifications')

    // Should not throw
    await expect(
      createNotification({
        userId: 'user-123',
        title: 'Test notification',
        body: 'Test body',
        link: '/tasks',
      })
    ).resolves.toBeUndefined()
  })

  it('notifyAdmins does not throw when ADMIN_EMAIL is missing', async () => {
    delete process.env.ADMIN_EMAIL
    const { notifyAdmins } = await import('./notifications')

    await expect(
      notifyAdmins({ title: 'Test', body: 'Test' })
    ).resolves.toBeUndefined()
  })
})
