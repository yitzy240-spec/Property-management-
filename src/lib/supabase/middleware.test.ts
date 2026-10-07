import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { ADMIN_PAGE_PREFIXES, matchesPrefix } from './middleware'

const ADMIN_DIR = join(__dirname, '..', '..', 'app', '(admin)')

describe('admin route protection', () => {
  // Regression: /codes, /visits and /reports were missing from the
  // middleware and served every entry code to logged-out visitors.
  it('gates every top-level route in src/app/(admin)', () => {
    const routes = readdirSync(ADMIN_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => `/${d.name}`)
    for (const route of routes) {
      expect(ADMIN_PAGE_PREFIXES, `${route} is not admin-gated`).toContain(route)
    }
  })

  it('runs the middleware on every admin route (matcher)', () => {
    const matcherSource = readFileSync(join(__dirname, '..', '..', 'middleware.ts'), 'utf-8')
    for (const prefix of ADMIN_PAGE_PREFIXES) {
      expect(matcherSource, `${prefix} missing from middleware matcher`).toContain(`'${prefix}/:path*'`)
    }
  })

  it('matches whole path segments only', () => {
    expect(matchesPrefix('/owners/abc', '/owners')).toBe(true)
    expect(matchesPrefix('/owners', '/owners')).toBe(true)
    expect(matchesPrefix('/owner', '/owners')).toBe(false)
    expect(matchesPrefix('/owners', '/owner')).toBe(false)
    expect(matchesPrefix('/codes', '/codes')).toBe(true)
  })
})
