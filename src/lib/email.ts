import { Resend } from 'resend'

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'ApartmentOS <noreply@apartmentos.app>'

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  const resend = getResend()
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY not set — email not sent:', subject, to)
    return { success: false, error: 'Email not configured' }
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  })

  if (error) {
    console.error('[Email] Send failed:', error)
    return { success: false, error: error.message }
  }

  return { success: true, id: data?.id }
}

/** Send a magic link to a contractor */
export async function sendContractorMagicLink(
  email: string,
  contractorName: string,
  propertyName: string,
  taskTitle: string,
  magicLinkUrl: string,
) {
  return sendEmail({
    to: email,
    subject: `Task: ${taskTitle} — ${propertyName}`,
    html: `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" style="height: 40px; margin-bottom: 16px;" />
        <h2 style="color: #1E3A5F; margin: 0 0 8px;">New Task Assignment</h2>
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px;">Hi ${contractorName},</p>
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 4px;">You have a new task at <strong>${propertyName}</strong>:</p>
        <p style="color: #111827; font-size: 16px; font-weight: 600; margin: 8px 0 16px;">${taskTitle}</p>
        <a href="${magicLinkUrl}" style="display: inline-block; background: #1E3A5F; color: #F8F7F4; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">View Task & Check In</a>
        <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">This link expires in 72 hours. If you have questions, contact your manager.</p>
        <p style="color: #9CA3AF; font-size: 11px; margin-top: 16px;">— Marcus Properties via ApartmentOS</p>
      </div>
    `,
  })
}

/** Send a check-in link to a guest */
export async function sendGuestCheckInLink(
  email: string,
  guestName: string,
  propertyName: string,
  checkIn: string,
  magicLinkUrl: string,
) {
  return sendEmail({
    to: email,
    subject: `Your Check-in Details — ${propertyName}`,
    html: `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" style="height: 40px; margin-bottom: 16px;" />
        <h2 style="color: #1E3A5F; margin: 0 0 8px;">Welcome to ${propertyName}</h2>
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px;">Hi ${guestName || 'Guest'},</p>
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 4px;">Your check-in is on <strong>${checkIn}</strong>.</p>
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px;">Your entry code will be available 24 hours before check-in.</p>
        <a href="${magicLinkUrl}" style="display: inline-block; background: #1E3A5F; color: #F8F7F4; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">View Check-in Details</a>
        <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">If you have questions, contact your host directly.</p>
        <p style="color: #9CA3AF; font-size: 11px; margin-top: 16px;">— Marcus Properties via ApartmentOS</p>
      </div>
    `,
  })
}

/** Send a magic login link to a property owner */
export async function sendOwnerLoginLink(
  email: string,
  ownerName: string,
  loginUrl: string,
) {
  return sendEmail({
    to: email,
    subject: 'Your ApartmentOS Login Link',
    html: `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" style="height: 40px; margin-bottom: 16px;" />
        <h2 style="color: #1E3A5F; margin: 0 0 8px;">Sign In to ApartmentOS</h2>
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px;">Hi ${ownerName},</p>
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 16px;">Click below to access your owner portal:</p>
        <a href="${loginUrl}" style="display: inline-block; background: #1E3A5F; color: #F8F7F4; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">Sign In</a>
        <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        <p style="color: #9CA3AF; font-size: 11px; margin-top: 16px;">— Marcus Properties via ApartmentOS</p>
      </div>
    `,
  })
}
