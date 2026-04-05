'use client'

import { Toaster as SonnerToaster } from 'sonner'

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        className: 'font-sans',
        style: {
          borderRadius: 'var(--radius-card)',
          border: '1px solid hsl(var(--border))',
          background: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
          fontSize: '0.875rem',
          boxShadow: 'var(--shadow-md)',
        },
      }}
      expand={false}
      richColors
    />
  )
}
