import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  ENCRYPTION_KEY: z.string().min(32).optional(),
})

export type Env = z.infer<typeof envSchema>

let _env: Env | null = null

/** Lazily validated environment variables. Throws on first access if invalid. */
export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    if (!_env) {
      // During build, env vars may not be available — use fallback
      if (process.env.NEXT_PHASE === 'phase-production-build') {
        return process.env[prop] ?? ''
      }
      _env = envSchema.parse(process.env)
    }
    return _env[prop as keyof Env]
  },
})
