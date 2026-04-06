import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

/**
 * POST /api/owners/invite
 * Invite an owner to the platform — creates auth user + sends welcome email.
 * Body: { owner_id: string }
 */
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { owner_id } = await request.json()
  if (!owner_id) {
    return NextResponse.json({ error: 'owner_id required' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // Get owner details
  const { data: owner } = await serviceClient
    .from('owners')
    .select('id, full_name, email, auth_user_id')
    .eq('id', owner_id)
    .single()

  if (!owner) {
    return NextResponse.json({ error: 'Owner not found' }, { status: 404 })
  }

  let authUserId = owner.auth_user_id

  // Create auth user if doesn't exist
  if (!authUserId) {
    const { data: authUser, error: createError } = await serviceClient.auth.admin.createUser({
      email: owner.email,
      email_confirm: true,
      app_metadata: { role: 'owner' },
      user_metadata: { full_name: owner.full_name },
    })

    if (createError) {
      // User might already exist in auth but not linked
      if (createError.message?.includes('already been registered')) {
        const { data: { users } } = await serviceClient.auth.admin.listUsers()
        const existing = users?.find(u => u.email === owner.email)
        if (existing) {
          authUserId = existing.id
          // Update their role to owner
          await serviceClient.auth.admin.updateUserById(existing.id, {
            app_metadata: { role: 'owner' },
          })
        } else {
          return NextResponse.json({ error: createError.message }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }
    } else {
      authUserId = authUser.user.id
    }

    // Link auth user to owner record
    await serviceClient
      .from('owners')
      .update({ auth_user_id: authUserId })
      .eq('id', owner.id)
  }

  // Generate a magic link for the owner
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://apartmentos.app'
  let magicLink: string | null = null

  const { data: linkData } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email: owner.email,
    options: {
      redirectTo: `${appUrl}/auth/callback?next=/owner`,
    },
  })

  if (linkData?.properties?.action_link) {
    magicLink = linkData.properties.action_link
  }

  const { data: properties } = await serviceClient
    .from('properties')
    .select('name')
    .eq('owner_id', owner.id)
    .eq('is_active', true)

  const propertyList = (properties || []).map(p => p.name).join(', ')

  await sendEmail({
    to: owner.email,
    subject: `${owner.full_name.split(' ')[0]}, your property portal is ready`,
    html: `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 520px; margin: 0 auto; background: #FAFAFA;">
        <!-- Header -->
        <div style="background: #1E3A5F; padding: 32px 24px; text-align: center; border-radius: 10px 10px 0 0;">
          <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" style="height: 48px; margin-bottom: 12px;" />
          <h1 style="color: #F8F7F4; font-size: 22px; font-weight: 600; margin: 0;">Welcome to Your Owner Portal</h1>
        </div>

        <!-- Body -->
        <div style="background: #FFFFFF; padding: 32px 24px; border: 1px solid #E2E8F0; border-top: none;">
          <p style="color: #111827; font-size: 15px; margin: 0 0 16px; line-height: 1.5;">
            Hi ${owner.full_name.split(' ')[0]},
          </p>
          <p style="color: #6B7280; font-size: 14px; margin: 0 0 20px; line-height: 1.6;">
            Ariel Marcus has set up a dedicated portal for you to stay informed about your
            ${propertyList ? 'propert' + ((properties?.length || 0) > 1 ? 'ies' : 'y') : 'properties'}
            in Jerusalem.
          </p>

          ${propertyList ? `
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
            <p style="color: #9CA3AF; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px;">Your Properties</p>
            <p style="color: #1E3A5F; font-size: 14px; font-weight: 600; margin: 0;">${propertyList}</p>
          </div>
          ` : ''}

          <p style="color: #6B7280; font-size: 14px; margin: 0 0 8px; line-height: 1.5;">
            With your portal you can:
          </p>
          <table style="width: 100%; margin-bottom: 24px;">
            <tr>
              <td style="padding: 4px 0; color: #6B7280; font-size: 13px;">&#9679; View bills and download PDFs</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6B7280; font-size: 13px;">&#9679; See upcoming bookings and revenue</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6B7280; font-size: 13px;">&#9679; Track maintenance and cleaning</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6B7280; font-size: 13px;">&#9679; Access documents (Tabu, insurance, contracts)</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6B7280; font-size: 13px;">&#9679; Message your property manager</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6B7280; font-size: 13px;">&#9679; Request personal stays</td>
            </tr>
          </table>

          ${magicLink ? `
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${magicLink}" style="display: inline-block; background: #1E3A5F; color: #F8F7F4; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600; letter-spacing: 0.3px;">
              Open Your Portal
            </a>
          </div>
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0 0 8px;">
            This link is valid for 24 hours.
          </p>
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            After your first visit, sign in anytime at the <strong>Owner</strong> tab on the login page.
          </p>
          ` : `
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${appUrl}/login" style="display: inline-block; background: #1E3A5F; color: #F8F7F4; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600; letter-spacing: 0.3px;">
              Sign In to Your Portal
            </a>
          </div>
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            Use this email address to sign in.
          </p>
          `}
        </div>

        <!-- Footer -->
        <div style="padding: 16px 24px; text-align: center; border-radius: 0 0 10px 10px;">
          <p style="color: #9CA3AF; font-size: 11px; margin: 0;">
            Marcus Properties &middot; Jerusalem Property Management
          </p>
        </div>
      </div>
    `,
  })

  return NextResponse.json({
    success: true,
    message: `Invite sent to ${owner.email}`,
    auth_user_id: authUserId,
  })
}
