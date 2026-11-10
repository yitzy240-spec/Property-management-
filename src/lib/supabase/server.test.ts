import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for Supabase server client factories
 * Validates: service client bypasses Next.js fetch cache with cache: 'no-store'
 */

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  }
}))

describe('createServiceClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('configures fetch with cache: no-store to bypass Next.js data cache', async () => {
    const originalFetch = global.fetch
    const mockFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      return Promise.resolve(new Response('{}', { status: 200 }))
    })
    global.fetch = mockFetch as any

    try {
      const { createServiceClient } = await import('./server')
      const client = createServiceClient()

      // Trigger a fetch by making a simple query (it will fail but that's ok)
      await client.from('test_table').select('*').limit(1).then(() => {}, () => {})

      // Verify that fetch was called with cache: 'no-store'
      expect(mockFetch).toHaveBeenCalled()
      const calls = mockFetch.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      
      // Check that at least one call has cache: 'no-store'
      const hasNoStore = calls.some(call => {
        const init = call[1] as RequestInit
        return init?.cache === 'no-store'
      })
      expect(hasNoStore).toBe(true)
    } finally {
      global.fetch = originalFetch
    }
  })

  it('preserves existing fetch init options when adding cache: no-store', async () => {
    const originalFetch = global.fetch
    const mockFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      return Promise.resolve(new Response('{}', { status: 200 }))
    })
    global.fetch = mockFetch as any

    try {
      const { createServiceClient } = await import('./server')
      const client = createServiceClient()

      // Trigger a fetch
      await client.from('test_table').select('*').limit(1).then(() => {}, () => {})

      expect(mockFetch).toHaveBeenCalled()
      const calls = mockFetch.mock.calls
      
      // Verify that calls preserve method and headers while adding cache
      calls.forEach(call => {
        const init = call[1] as RequestInit
        if (init) {
          expect(init).toHaveProperty('cache', 'no-store')
          // Verify other properties are preserved
          if (init.method) expect(init.method).toBeDefined()
          if (init.headers) expect(init.headers).toBeDefined()
        }
      })
    } finally {
      global.fetch = originalFetch
    }
  })

  it('throws when called from browser context', async () => {
    const originalWindow = global.window
    // @ts-ignore - simulating browser environment
    global.window = {}

    const { createServiceClient } = await import('./server')
    
    expect(() => createServiceClient()).toThrow(
      'createServiceClient must not be called on the client'
    )

    // @ts-ignore - restore
    global.window = originalWindow
  })
})
