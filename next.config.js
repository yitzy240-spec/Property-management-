const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  workboxOptions: {
    // Never serve a cached fallback for page navigations — pages show live data.
    navigateFallbackDenylist: [/.*/],
    runtimeCaching: [
      {
        // Always fetch pages fresh from the network. This app shows live data
        // (entry codes, financials, bookings); serving a cached page makes
        // edits look like they "didn't save". Covers every page navigation plus
        // the explicit guest/contractor/api prefixes. Static assets
        // (request.mode !== 'navigate') are unaffected and still cached.
        urlPattern: ({ request, url }) =>
          request?.mode === 'navigate' ||
          url.pathname.startsWith('/guest/') ||
          url.pathname.startsWith('/contractor/') ||
          url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
      },
    ],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't reuse the client-side router cache for dynamic pages — always re-fetch
  // so admin pages (codes, property edit) reflect the latest DB after a change.
  experimental: {
    staleTimes: { dynamic: 0 },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'l.icdbcdn.com' },
    ],
  },
}

module.exports = withPWA(nextConfig)
