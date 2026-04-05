'use client'

import { cn } from '@/lib/utils'

interface LogoSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  className?: string
}

/**
 * Animated Marcus Properties logo used for loading/transition states.
 * Pulses with a subtle scale + opacity animation.
 */
export function LogoSpinner({ size = 'md', text, className }: LogoSpinnerProps) {
  const sizeClasses = {
    sm: 'h-8',
    md: 'h-12',
    lg: 'h-16',
  }

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="relative">
        {/* Ping ring */}
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/10" style={{ animationDuration: '2s' }} />

        {/* Logo with pulse */}
        <img
          src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400"
          alt="Marcus Properties"
          className={cn(
            sizeClasses[size],
            'relative w-auto animate-pulse',
          )}
          style={{ animationDuration: '1.5s' }}
        />
      </div>

      {text && (
        <p className="animate-pulse text-xs font-medium text-muted-foreground" style={{ animationDuration: '1.5s' }}>
          {text}
        </p>
      )}
    </div>
  )
}

/**
 * Full-screen loading overlay with animated logo.
 * Used for page transitions and auth redirects.
 */
export function FullScreenLoader({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#FAFAFA]">
      <LogoSpinner size="lg" text={text} />
    </div>
  )
}
