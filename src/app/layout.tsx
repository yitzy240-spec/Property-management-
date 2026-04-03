import type { Metadata, Viewport } from 'next'
import { Inter, Geist } from 'next/font/google'
import { Providers } from '@/components/providers'
import '@/styles/globals.css'
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

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
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
