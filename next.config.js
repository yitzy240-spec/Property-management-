/** @type {import('next').NextConfig} */
const nextConfig = {
  // PWA: will wrap with @ducanh2912/next-pwa when ready
  // Native Android: Capacitor will use `output: 'export'` in a separate build config
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

module.exports = nextConfig
