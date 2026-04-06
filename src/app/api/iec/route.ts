import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { initLogin, sendOtp, verifyOtp, syncIecBills, getBillingInvoices, getIecStatus } from '@/lib/iec-api'

/**
 * POST /api/iec — IEC operations (per-property)
 * Auth flow: login → select factor → send_otp → verify_otp
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
        // Step 1: Send ID to Okta, get available OTP factors
        const { israeliId } = body
        if (!israeliId) return NextResponse.json({ error: 'ID number required' }, { status: 400 })
        const result = await initLogin(israeliId)
        return NextResponse.json({
          success: true,
          factors: result.factors,
        })
      }

      case 'send_otp': {
        // Step 2: Send OTP to chosen factor
        const { factorId } = body
        if (!factorId) return NextResponse.json({ error: 'factorId required' }, { status: 400 })
        await sendOtp(factorId)
        return NextResponse.json({ success: true, message: 'OTP sent' })
      }

      case 'verify_otp': {
        // Step 3: Verify OTP and get tokens
        const { otpCode, factorId } = body
        if (!otpCode || !factorId || !propertyId) {
          return NextResponse.json({ error: 'otpCode, factorId, and propertyId required' }, { status: 400 })
        }
        const tokens = await verifyOtp(otpCode, factorId, propertyId)
        return NextResponse.json({
          success: true,
          bpNumber: tokens.bpNumber,
          contracts: tokens.contractIds,
          debug: {
            hasIdToken: !!tokens.idToken,
            idTokenLength: tokens.idToken?.length || 0,
            bpNumber: tokens.bpNumber,
            contractCount: tokens.contractIds.length,
          },
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
