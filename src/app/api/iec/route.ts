import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { initLogin, verifyOtp, syncIecBills, getBillingInvoices, getIecStatus } from '@/lib/iec-api'

/**
 * POST /api/iec — IEC operations (per-property)
 * Body: { action: 'status' | 'login' | 'verify_otp' | 'sync' | 'invoices', propertyId, ... }
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { action, propertyId } = body

  try {
    switch (action) {
      case 'status': {
        if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
        const status = await getIecStatus(propertyId)
        return NextResponse.json(status)
      }

      case 'login': {
        const { israeliId } = body
        if (!israeliId) return NextResponse.json({ error: 'israeliId required' }, { status: 400 })
        const result = await initLogin(israeliId)
        return NextResponse.json({ success: true, message: 'OTP sent to your phone', ...result })
      }

      case 'verify_otp': {
        const { israeliId: id, otpCode } = body
        if (!id || !otpCode || !propertyId) return NextResponse.json({ error: 'israeliId, otpCode, and propertyId required' }, { status: 400 })
        const tokens = await verifyOtp(id, otpCode, propertyId)
        return NextResponse.json({
          success: true,
          bpNumber: tokens.bpNumber,
          contracts: tokens.contractIds,
        })
      }

      case 'sync': {
        if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
        const result = await syncIecBills(propertyId)
        return NextResponse.json(result)
      }

      case 'invoices': {
        if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
        const { contractId, bpNumber } = body
        const invoices = await getBillingInvoices(propertyId, contractId, bpNumber)
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
