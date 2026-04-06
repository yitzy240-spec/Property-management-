import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { initLogin, verifyOtp, syncIecBills, getBillingInvoices } from '@/lib/iec-api'

/**
 * POST /api/iec — IEC operations
 * Body: { action: 'login' | 'verify_otp' | 'sync' | 'invoices', ... }
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { action } = body

  try {
    switch (action) {
      case 'status': {
        // Check if IEC is connected
        try {
          const { createServiceClient } = await import('@/lib/supabase/server')
          const { decrypt } = await import('@/lib/encryption')
          const sc = createServiceClient()
          const { data } = await sc.from('app_settings').select('value').eq('key', 'iec_tokens').single()
          if (data?.value) {
            const tokens = JSON.parse(await decrypt(data.value))
            return NextResponse.json({ connected: true, contracts: tokens.contractIds || [] })
          }
        } catch {}
        return NextResponse.json({ connected: false, contracts: [] })
      }

      case 'login': {
        // Step 1: Send OTP
        const { israeliId } = body
        if (!israeliId) return NextResponse.json({ error: 'israeliId required' }, { status: 400 })
        const result = await initLogin(israeliId)
        return NextResponse.json({ success: true, message: 'OTP sent to your phone', ...result })
      }

      case 'verify_otp': {
        // Step 2: Verify OTP and get tokens
        const { israeliId: id, otpCode } = body
        if (!id || !otpCode) return NextResponse.json({ error: 'israeliId and otpCode required' }, { status: 400 })
        const tokens = await verifyOtp(id, otpCode)
        return NextResponse.json({
          success: true,
          bpNumber: tokens.bpNumber,
          contracts: tokens.contractIds,
        })
      }

      case 'sync': {
        // Pull all invoices and sync to bills table
        const result = await syncIecBills()
        return NextResponse.json(result)
      }

      case 'invoices': {
        // Just list invoices without syncing
        const { contractId, bpNumber } = body
        const invoices = await getBillingInvoices(contractId, bpNumber)
        return NextResponse.json({ invoices })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'IEC operation failed' },
      { status: 500 }
    )
  }
}
