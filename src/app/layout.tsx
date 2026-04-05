import type { Metadata, Viewport } from 'next'
import { Inter, IBM_Plex_Mono } from 'next/font/google'
import { Providers } from '@/components/providers'
import { cn } from '@/lib/utils'
import '@/styles/globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'ApartmentOS — Property Management',
  description: 'Property management platform for Jerusalem rentals',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0074c7',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn('font-sans', inter.variable, ibmPlexMono.variable)}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
