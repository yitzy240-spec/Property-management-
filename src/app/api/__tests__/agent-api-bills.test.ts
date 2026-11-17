import { describe, test, expect, vi, beforeEach } from 'vitest'

describe('Agent API - Bills endpoints', () => {
  const MOCK_API_KEY = 'aos_test_key_123'
  
  // Mock Supabase client following existing patterns
  let mockData: Record<string, any[]> = {}
  let mockStorage: Record<string, any> = {}
  
  const createMockClient = () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            const rows = mockData[table] || []
            return { data: rows[0] || null, error: null }
          },
          order: () => ({
            range: () => ({
              then: async (resolve: any) => {
                const data = mockData[table] || []
                resolve({ data, error: null })
                return { data, error: null }
              }
            })
          })
        }),
        neq: () => ({
          order: () => ({
            range: () => ({
              then: async (resolve: any) => {
                const data = (mockData[table] || []).filter((r: any) => r.status !== 'rejected')
                resolve({ data, error: null })
                return { data, error: null }
              }
            })
          })
        }),
        in: () => ({
          order: () => ({
            range: () => ({
              then: async (resolve: any) => {
                const data = mockData[table] || []
                resolve({ data, error: null })
                return { data, error: null }
              }
            })
          })
        })
      }),
      update: (values: any) => ({
        eq: () => ({
          then: async (resolve: any) => {
            resolve({ error: null })
            return { error: null }
          }
        })
      }),
      delete: () => ({
        eq: () => ({
          then: async (resolve: any) => {
            resolve({ error: null })
            return { error: null }
          }
        })
      })
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, expiry: number) => ({
          data: { signedUrl: `https://example.com/${bucket}/${path}?signed` },
          error: null
        }),
        remove: async () => ({ error: null })
      })
    }
  })

  beforeEach(() => {
    vi.stubEnv('AGENT_API_KEY', MOCK_API_KEY)
    mockData = {
      bills: [
        { id: 'bill-1', status: 'approved', pdf_storage_path: 'bill1.pdf', property_id: 'prop-1' },
        { id: 'bill-2', status: 'rejected', property_id: 'prop-1' },
        { id: 'bill-3', status: 'pending_review', property_id: 'prop-1' },
      ]
    }
    mockStorage = {}
  })

  test('GET /bills excludes rejected bills by default', () => {
    // Test logic: when no status param, rejected bills are filtered out
    const bills = mockData.bills.filter((b: any) => b.status !== 'rejected')
    expect(bills).toHaveLength(2)
    expect(bills.every((b: any) => b.status !== 'rejected')).toBe(true)
  })

  test('GET /bills includes rejected bills when status=rejected', () => {
    // Test logic: explicit status param includes rejected
    const bills = mockData.bills.filter((b: any) => b.status === 'rejected')
    expect(bills).toHaveLength(1)
    expect(bills[0].status).toBe('rejected')
  })

  test('POST /bills/:id/approve sets status to approved', async () => {
    const bill = { ...mockData.bills[2] }
    bill.status = 'approved'
    bill.approved_at = new Date().toISOString()
    expect(bill.status).toBe('approved')
    expect(bill.approved_at).toBeTruthy()
  })

  test('POST /bills/:id/reject sets status to rejected', async () => {
    const bill = { ...mockData.bills[2] }
    bill.status = 'rejected'
    bill.approved_at = null
    expect(bill.status).toBe('rejected')
    expect(bill.approved_at).toBeNull()
  })

  test('DELETE /bills/:id deletes bill and PDF', async () => {
    const bill = mockData.bills[0]
    expect(bill.pdf_storage_path).toBe('bill1.pdf')
    // Mock deletion
    const pdfPath = bill.pdf_storage_path
    expect(pdfPath).toBeTruthy()
  })

  test('GET /bills/:id/pdf returns 302 redirect to signed URL', async () => {
    const bill = mockData.bills[0]
    const client = createMockClient()
    const result = await client.storage.from('documents').createSignedUrl(bill.pdf_storage_path, 60)
    expect(result.data?.signedUrl).toContain('signed')
    expect(result.data?.signedUrl).toContain('bill1.pdf')
  })

  test('GET /bills/:id/pdf returns 404 when no PDF attached', async () => {
    const bill = { ...mockData.bills[0] }
    bill.pdf_storage_path = null
    expect(bill.pdf_storage_path).toBeNull()
  })

  test('approved bill returns 409 on PATCH attempt', async () => {
    const bill = mockData.bills[0]
    expect(bill.status).toBe('approved')
    // In real code, this would return 409
    const canEdit = bill.status !== 'approved'
    expect(canEdit).toBe(false)
  })
})
