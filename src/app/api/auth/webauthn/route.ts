import { NextResponse } from 'next/server'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RegistrationResponseJSON = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthenticationResponseJSON = any
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase/server'

const RP_NAME = 'ApartmentOS'
const RP_ID = process.env.WEBAUTHN_RP_ID || 'app.marcus-properties.com'
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || `https://${RP_ID}`

/**
 * POST /api/auth/webauthn
 * Actions: register_options, register_verify, login_options, login_verify
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { action } = body

  try {
    switch (action) {
      case 'register_options': {
        // User must be logged in to register a passkey
        const supabase = createServerSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

        const serviceClient = createServiceClient()

        // Get existing passkeys for this user
        const { data: existing } = await serviceClient
          .from('passkeys')
          .select('credential_id')
          .eq('user_id', user.id)

        const options = await generateRegistrationOptions({
          rpName: RP_NAME,
          rpID: RP_ID,
          userID: new TextEncoder().encode(user.id),
          userName: user.email || user.id,
          userDisplayName: user.email?.split('@')[0] || 'User',
          attestationType: 'none',
          authenticatorSelection: {
            authenticatorAttachment: 'platform', // Face ID / fingerprint only
            userVerification: 'required',
            residentKey: 'preferred',
          },
          excludeCredentials: (existing || []).map(p => ({
            id: p.credential_id,
            type: 'public-key',
          })),
        })

        // Store challenge temporarily
        await serviceClient.from('app_settings').upsert({
          key: `webauthn_challenge_${user.id}`,
          value: JSON.stringify({ challenge: options.challenge, userId: user.id }),
          description: 'Temporary WebAuthn challenge',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })

        return NextResponse.json(options)
      }

      case 'register_verify': {
        const supabase = createServerSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

        const serviceClient = createServiceClient()

        // Get stored challenge
        const { data: challengeData } = await serviceClient
          .from('app_settings')
          .select('value')
          .eq('key', `webauthn_challenge_${user.id}`)
          .single()

        if (!challengeData?.value) {
          return NextResponse.json({ error: 'No registration in progress' }, { status: 400 })
        }

        const { challenge } = JSON.parse(challengeData.value)
        const response = body.response as RegistrationResponseJSON

        const verification = await verifyRegistrationResponse({
          response,
          expectedChallenge: challenge,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
        })

        if (!verification.verified || !verification.registrationInfo) {
          return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
        }

        const { credential, credentialDeviceType } = verification.registrationInfo

        // Store passkey
        await serviceClient.from('passkeys').insert({
          user_id: user.id,
          credential_id: Buffer.from(credential.id).toString('base64url'),
          public_key: Buffer.from(credential.publicKey).toString('base64url'),
          counter: credential.counter,
          device_name: credentialDeviceType === 'multiDevice' ? 'Multi-device' : 'This device',
          transports: response.response.transports || [],
        })

        // Clean up challenge
        await serviceClient.from('app_settings').delete().eq('key', `webauthn_challenge_${user.id}`)

        return NextResponse.json({ verified: true })
      }

      case 'login_options': {
        const serviceClient = createServiceClient()

        // Check if there are any passkeys for this email
        const { email } = body
        if (!email) {
          // No email — generate options for any discoverable credential
          const options = await generateAuthenticationOptions({
            rpID: RP_ID,
            userVerification: 'required',
          })

          await serviceClient.from('app_settings').upsert({
            key: 'webauthn_login_challenge',
            value: JSON.stringify({ challenge: options.challenge }),
            description: 'Temporary WebAuthn login challenge',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' })

          return NextResponse.json(options)
        }

        // Find user by email
        const { data: { users } } = await serviceClient.auth.admin.listUsers()
        const authUser = users?.find(u => u.email === email)
        if (!authUser) {
          return NextResponse.json({ error: 'No passkey found' }, { status: 404 })
        }

        const { data: passkeys } = await serviceClient
          .from('passkeys')
          .select('credential_id, transports')
          .eq('user_id', authUser.id)

        if (!passkeys?.length) {
          return NextResponse.json({ error: 'No passkey found' }, { status: 404 })
        }

        const options = await generateAuthenticationOptions({
          rpID: RP_ID,
          userVerification: 'required',
          allowCredentials: passkeys.map(p => ({
            id: p.credential_id,
            type: 'public-key' as const,
            transports: p.transports || [],
          })),
        })

        await serviceClient.from('app_settings').upsert({
          key: `webauthn_login_challenge_${authUser.id}`,
          value: JSON.stringify({ challenge: options.challenge, userId: authUser.id }),
          description: 'Temporary WebAuthn login challenge',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })

        return NextResponse.json({ ...options, userId: authUser.id })
      }

      case 'login_verify': {
        const serviceClient = createServiceClient()
        const { userId } = body
        const response = body.response as AuthenticationResponseJSON

        // Get stored challenge
        const challengeKey = userId ? `webauthn_login_challenge_${userId}` : 'webauthn_login_challenge'
        const { data: challengeData } = await serviceClient
          .from('app_settings')
          .select('value')
          .eq('key', challengeKey)
          .single()

        if (!challengeData?.value) {
          return NextResponse.json({ error: 'No login in progress' }, { status: 400 })
        }

        const { challenge } = JSON.parse(challengeData.value)

        // Find the passkey
        const credentialId = response.id
        const { data: passkey } = await serviceClient
          .from('passkeys')
          .select('*')
          .eq('credential_id', credentialId)
          .single()

        if (!passkey) {
          return NextResponse.json({ error: 'Passkey not found' }, { status: 404 })
        }

        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
          credential: {
            id: passkey.credential_id,
            publicKey: Buffer.from(passkey.public_key, 'base64url'),
            counter: passkey.counter,
            transports: passkey.transports || [],
          },
        })

        if (!verification.verified) {
          return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
        }

        // Update counter and last_used
        await serviceClient
          .from('passkeys')
          .update({
            counter: verification.authenticationInfo.newCounter,
            last_used_at: new Date().toISOString(),
          })
          .eq('id', passkey.id)

        // Clean up challenge
        await serviceClient.from('app_settings').delete().eq('key', challengeKey)

        // Generate a session for this user using Supabase admin
        // We create a magic link and return it for the client to exchange
        const { data: linkData } = await serviceClient.auth.admin.generateLink({
          type: 'magiclink',
          email: (await serviceClient.auth.admin.getUserById(passkey.user_id)).data.user?.email || '',
        })

        if (!linkData?.properties?.action_link) {
          return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
        }

        // Extract the token from the magic link
        const url = new URL(linkData.properties.action_link)
        const token_hash = url.searchParams.get('token_hash') || url.hash?.match(/token=([^&]+)/)?.[1] || ''

        return NextResponse.json({
          verified: true,
          token_hash,
          email: linkData.properties.email_otp ? undefined : url.searchParams.get('token'),
          // Return the full verification URL for the client to call
          verification_url: linkData.properties.action_link,
        })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err) {
    console.error('[WebAuthn]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'WebAuthn error' },
      { status: 500 }
    )
  }
}
