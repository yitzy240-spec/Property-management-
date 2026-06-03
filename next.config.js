const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  workboxOptions: {
    navigateFallbackDenylist: [/^\/guest\//, /^\/contractor\//, /^\/api\//],
    runtimeCaching: [
      {
        urlPattern: ({ url }) =>
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
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'l.icdbcdn.com' },
    ],
  },
}

module.exports = withPWA(nextConfig)
