import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getEffectiveOwnerId,
  assertNotImpersonating,
  isAdminUser,
  IMPERSONATE_OWNER_COOKIE,
} from './impersonation'

type AnyUser = {
  id: string
  email?: string
  app_metadata?: { role?: string }
}

/** Build a mock auth client that returns the given user from getUser(). */
function mockAuthClient(user: AnyUser | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  }
}

/**
 * Build a mock service client.
 *
 * `ownersById` maps owner_id → row, used for impersonation target lookup.
 * `ownersByAuthId` maps auth_user_id → row, used for own-owner lookup.
 */
function mockServiceClient(
  ownersById: Record<string, { id: string; full_name: string } | null>,
  ownersByAuthId: Record<string, { id: string } | null>
) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'owners') throw new Error(`unexpected table ${table}`)
      return {
        select: vi.fn(() => ({
          eq: vi.fn((col: string, value: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data:
                col === 'id'
                  ? ownersById[value] ?? null
                  : col === 'auth_user_id'
                    ? ownersByAuthId[value] ?? null
                    : null,
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data:
                col === 'id'
                  ? ownersById[value] ?? null
                  : col === 'auth_user_id'
                    ? ownersByAuthId[value] ?? null
                    : null,
              error: null,
            }),
          })),
        })),
      }
    }),
  }
}

/** Build a mock cookies store. */
function mockCookies(value: string | null) {
  return {
    get: vi.fn((name: string) =>
      name === IMPERSONATE_OWNER_COOKIE && value ? { value } : undefined
    ),
  }
}

beforeEach(() => {
  delete process.env.ADMIN_EMAIL
})

describe('isAdminUser', () => {
  it('returns true for app_metadata.role === admin', () => {
    expect(
      isAdminUser({ id: 'u1', app_metadata: { role: 'admin' } } as never)
    ).toBe(true)
  })

  it('returns true when user email matches ADMIN_EMAIL', () => {
    process.env.ADMIN_EMAIL = 'ariel@example.com'
    expect(isAdminUser({ id: 'u1', email: 'ariel@example.com' } as never)).toBe(true)
  })

  it('returns false for plain users', () => {
    expect(isAdminUser({ id: 'u1', email: 'owner@example.com' } as never)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isAdminUser(null)).toBe(false)
  })
})

describe('getEffectiveOwnerId', () => {
  it('returns admin-impersonated owner_id when cookie is set + actual user is admin', async () => {
    const auth = mockAuthClient({
      id: 'admin-1',
      email: 'admin@example.com',
      app_metadata: { role: 'admin' },
    })
    const service = mockServiceClient(
      { 'owner-target-1': { id: 'owner-target-1', full_name: 'Sarah Cohen' } },
      {}
    )
    const cookies = mockCookies('owner-target-1')

    const result = await getEffectiveOwnerId(auth as never, service as never, cookies)

    expect(result.ownerId).toBe('owner-target-1')
    expect(result.isImpersonating).toBe(true)
    expect(result.impersonatedName).toBe('Sarah Cohen')
    expect(result.actualUser?.id).toBe('admin-1')
  })

  it('returns actual user own owner_id when no cookie is set', async () => {
    const auth = mockAuthClient({
      id: 'owner-auth-1',
      email: 'owner@example.com',
    })
    const service = mockServiceClient({}, { 'owner-auth-1': { id: 'owner-9' } })
    const cookies = mockCookies(null)

    const result = await getEffectiveOwnerId(auth as never, service as never, cookies)

    expect(result.ownerId).toBe('owner-9')
    expect(result.isImpersonating).toBe(false)
    expect(result.impersonatedName).toBeNull()
  })

  it('IGNORES cookie when actual user is NOT admin (security check)', async () => {
    // A non-admin somehow has the impersonation cookie set —
    // we must completely ignore it and serve their own data.
    const auth = mockAuthClient({
      id: 'owner-auth-1',
      email: 'owner@example.com',
    })
    const service = mockServiceClient(
      { 'owner-target-1': { id: 'owner-target-1', full_name: 'Sarah Cohen' } },
      { 'owner-auth-1': { id: 'owner-9' } }
    )
    const cookies = mockCookies('owner-target-1')

    const result = await getEffectiveOwnerId(auth as never, service as never, cookies)

    expect(result.ownerId).toBe('owner-9')
    expect(result.isImpersonating).toBe(false)
    expect(result.impersonatedName).toBeNull()
  })

  it('returns null ownerId when cookie set + admin but target owner does NOT exist', async () => {
    const auth = mockAuthClient({
      id: 'admin-1',
      email: 'admin@example.com',
      app_metadata: { role: 'admin' },
    })
    // No owner with that id
    const service = mockServiceClient({}, {})
    const cookies = mockCookies('owner-missing')

    const result = await getEffectiveOwnerId(auth as never, service as never, cookies)

    expect(result.ownerId).toBeNull()
    expect(result.isImpersonating).toBe(true)
    expect(result.impersonatedName).toBeNull()
  })

  it('returns null actualUser when not authenticated', async () => {
    const auth = mockAuthClient(null)
    const service = mockServiceClient({}, {})
    const cookies = mockCookies('owner-x')

    const result = await getEffectiveOwnerId(auth as never, service as never, cookies)

    expect(result.actualUser).toBeNull()
    expect(result.ownerId).toBeNull()
    expect(result.isImpersonating).toBe(false)
  })
})

describe('assertNotImpersonating', () => {
  it('does NOT throw when cookie absent', () => {
    expect(() => assertNotImpersonating(mockCookies(null))).not.toThrow()
  })

  it('throws when impersonation cookie is set', () => {
    expect(() => assertNotImpersonating(mockCookies('any-id'))).toThrow(
      /Impersonation is read-only/
    )
  })
})
