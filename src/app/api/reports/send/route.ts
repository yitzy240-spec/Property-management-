import { NextResponse } from 'next/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

/**
 * POST /api/reports/send
 * Sends a quarterly report to the owner via email and marks it as sent.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { report_id } = await request.json()
  if (!report_id) {
    return NextResponse.json({ error: 'report_id required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  const { data: report } = await serviceClient
    .from('owner_reports')
    .select('*, owners(full_name, email)')
    .eq('id', report_id)
    .single()

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  if (report.status !== 'approved') {
    return NextResponse.json({ error: 'Report must be approved before sending' }, { status: 400 })
  }

  const owner = report.owners as { full_name: string; email: string } | null
  if (!owner?.email) {
    return NextResponse.json({ error: 'Owner email not found' }, { status: 400 })
  }

  const narrative = report.edited_narrative_en || report.ai_narrative_en || ''
  const narrativeHe = report.edited_narrative_he || report.ai_narrative_he || ''

  const emailResult = await sendEmail({
    to: owner.email,
    subject: `Quarterly Report — Q${report.quarter} ${report.year} — Marcus Properties`,
    html: `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" style="height: 40px; margin-bottom: 16px;" />
        <h2 style="color: #1E3A5F; margin: 0 0 4px;">Quarterly Report</h2>
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 24px;">Q${report.quarter} ${report.year}</p>
        <div style="color: #374151; font-size: 14px; line-height: 1.7; white-space: pre-line;">${narrative}</div>
        ${narrativeHe ? `
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
        <div dir="rtl" style="color: #374151; font-size: 14px; line-height: 1.7; white-space: pre-line;">${narrativeHe}</div>
        ` : ''}
        <p style="color: #9CA3AF; font-size: 11px; margin-top: 32px;">— Marcus Properties via ApartmentOS</p>
      </div>
    `,
  })

  if (!emailResult.success) {
    return NextResponse.json({ error: emailResult.error || 'Email send failed' }, { status: 500 })
  }

  await serviceClient
    .from('owner_reports')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_via: 'email',
    })
    .eq('id', report_id)

  return NextResponse.json({ success: true })
}
