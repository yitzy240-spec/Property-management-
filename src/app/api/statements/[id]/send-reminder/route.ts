import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { sendEmail, escapeHtml } from '@/lib/email'
import { formatILS } from '@/lib/utils'
import { CC_SURCHARGE_RATE } from '@/lib/statements'
import { getDocumentPdfLinks } from '@/lib/green-invoice'

/**
 * POST /api/statements/[id]/send-reminder
 * Send payment reminder email to owner with both payment options:
 * - Bank transfer (no surcharge)
 * - Credit card via Green Invoice link (with 3.5% surcharge disclosed)
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const { data: statement, error } = await serviceClient
    .from('monthly_statements')
    .select('*, owners(full_name, email)')
    .eq('id', params.id)
    .single()

  if (error || !statement) {
    return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
  }

  if (statement.status === 'paid') {
    return NextResponse.json({ error: 'Statement already paid' }, { status: 400 })
  }

  if (statement.status === 'draft' || statement.status === 'pending_approval') {
    return NextResponse.json({ error: 'Statement must be approved before sending to owner' }, { status: 400 })
  }

  const owner = statement.owners as { full_name: string; email: string }
  const monthLabel = new Date(statement.billing_month + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const netAmount = Math.abs(statement.net_amount_agorot)
  const surchargePercent = (CC_SURCHARGE_RATE * 100).toFixed(1)

  const ownerName = escapeHtml(owner.full_name.split(' ')[0] || owner.full_name)

  // Build line items summary
  const lineItems = statement.line_items as Array<{ description: string; amount_agorot: number; category: string; property_name: string }>
  const lineItemsHtml = lineItems
    .filter(li => li.amount_agorot !== 0)
    .map(li => {
      const sign = li.amount_agorot < 0 ? '-' : ''
      return `<tr>
        <td style="padding: 6px 0; font-size: 13px; color: #374151; border-bottom: 1px solid #F3F4F6;">${escapeHtml(li.description)}</td>
        <td style="padding: 6px 0; font-size: 13px; color: #374151; text-align: right; border-bottom: 1px solid #F3F4F6;">${sign}${formatILS(Math.abs(li.amount_agorot))}</td>
      </tr>`
    })
    .join('')

  // Fetch PDF link from Green Invoice if document exists
  let pdfUrl: string | null = null
  if (statement.gi_proforma_id) {
    try {
      const pdfLinks = await getDocumentPdfLinks(statement.gi_proforma_id)
      pdfUrl = pdfLinks.en || pdfLinks.origin || pdfLinks.he || null
    } catch {
      // PDF link not available — continue without it
    }
  }

  const invoicePdfHtml = pdfUrl ? `
    <div style="text-align: center; margin-bottom: 20px;">
      <a href="${escapeHtml(pdfUrl)}" style="display: inline-block; background: #1E3A5F; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">View Invoice (PDF)</a>
    </div>
  ` : ''

  // Payment section
  const paymentUrl = statement.gi_proforma_url

  const payOnlineHtml = paymentUrl ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin-bottom: 16px;">
      <tr>
        <td align="center" style="padding: 0;">
          <a href="${escapeHtml(paymentUrl)}" style="display: inline-block; background: #1E3A5F; color: #ffffff; padding: 16px 48px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600; letter-spacing: 0.02em;">Pay Online</a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 10px 0 0;">
          <p style="font-size: 12px; color: #9CA3AF; margin: 0;">Credit card, Apple Pay, Google Pay, or Bit</p>
          <p style="font-size: 11px; color: #9CA3AF; margin: 2px 0 0;">A ${surchargePercent}% processing fee applies to card payments</p>
        </td>
      </tr>
    </table>
  ` : ''

  const bankName = process.env.BANK_BENEFICIARY_NAME || 'Sara & Ariel Marcus'
  const bankDisplay = process.env.BANK_DISPLAY_NAME || 'First International Bank (31)'
  const bankBranch = process.env.BANK_BRANCH || '095'
  const bankAccount = process.env.BANK_ACCOUNT || '259085'

  const bankTransferHtml = `
    <div style="border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px;">
      <p style="font-size: 13px; font-weight: 600; color: #374151; margin: 0 0 8px;">Pay by Bank Transfer</p>
      <table style="width: 100%; font-size: 12px; color: #374151;">
        <tr><td style="padding: 2px 0; color: #6B7280;">Beneficiary</td><td style="padding: 2px 0; text-align: right;">${escapeHtml(bankName)}</td></tr>
        <tr><td style="padding: 2px 0; color: #6B7280;">Bank</td><td style="padding: 2px 0; text-align: right;">${escapeHtml(bankDisplay)}</td></tr>
        <tr><td style="padding: 2px 0; color: #6B7280;">Branch</td><td style="padding: 2px 0; text-align: right;">${escapeHtml(bankBranch)}</td></tr>
        <tr><td style="padding: 2px 0; color: #6B7280;">Account</td><td style="padding: 2px 0; text-align: right;">${escapeHtml(bankAccount)}</td></tr>
        <tr><td style="padding: 2px 0; color: #6B7280;">Amount</td><td style="padding: 2px 0; text-align: right; font-weight: 600;">${formatILS(netAmount)}</td></tr>
      </table>
      <p style="font-size: 11px; color: #9CA3AF; margin: 8px 0 0;">No processing fee</p>
    </div>
  `

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" style="height: 40px; margin-bottom: 16px;" />
      <h2 style="color: #1E3A5F; margin: 0 0 4px;">Monthly Statement — ${monthLabel}</h2>
      <p style="color: #6B7280; font-size: 14px; margin: 0 0 20px;">Hi ${ownerName},</p>

      <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">
        ${statement.reminder_sent_at ? 'This is a reminder that your' : 'Your'} monthly statement is ready.
        The balance due is <strong>${formatILS(netAmount)}</strong>.
      </p>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 8px 0; font-size: 11px; text-transform: uppercase; color: #9CA3AF; border-bottom: 2px solid #E5E7EB;">Description</th>
            <th style="text-align: right; padding: 8px 0; font-size: 11px; text-transform: uppercase; color: #9CA3AF; border-bottom: 2px solid #E5E7EB;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHtml}
          <tr>
            <td style="padding: 10px 0; font-size: 14px; font-weight: 700; color: #111827;">Balance Due</td>
            <td style="padding: 10px 0; font-size: 14px; font-weight: 700; color: #111827; text-align: right;">${formatILS(netAmount)}</td>
          </tr>
        </tbody>
      </table>

      ${payOnlineHtml}

      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 8px 0 16px;" />

      ${bankTransferHtml}

      ${invoicePdfHtml ? `<div style="margin-top: 16px; text-align: center;">${invoicePdfHtml}</div>` : ''}

      <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">If you've already made this payment, please disregard this email. For questions, reply directly to this email or contact your property manager.</p>
      <p style="color: #9CA3AF; font-size: 11px; margin-top: 16px;">— Marcus Properties via ApartmentOS</p>
    </div>
  `

  const subject = statement.reminder_sent_at
    ? `Reminder: Statement for ${monthLabel} — ${formatILS(netAmount)} due`
    : `Monthly Statement for ${monthLabel} — ${formatILS(netAmount)}`

  const result = await sendEmail({
    to: owner.email,
    subject,
    html,
  })

  if (!result.success) {
    return NextResponse.json({ error: `Email failed: ${result.error}` }, { status: 500 })
  }

  // Update statement — transition approved→sent on first send
  const newStatus = (statement.status === 'approved') ? 'sent' : statement.status
  const { error: updateErr } = await serviceClient
    .from('monthly_statements')
    .update({
      reminder_sent_at: new Date().toISOString(),
      status: newStatus,
      sent_at: statement.sent_at || new Date().toISOString(),
    })
    .eq('id', params.id)

  if (updateErr) {
    console.error('[Send Reminder] Statement update failed:', updateErr)
  }

  return NextResponse.json({ message: 'Reminder sent', email_id: result.id })
}
