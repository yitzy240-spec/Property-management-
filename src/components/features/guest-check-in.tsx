'use client'

import { useState, useEffect } from 'react'
import { Clock, MapPin, Play, Lock, KeyRound, BookOpen, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GuestLink } from '@/types'

interface GuestCheckInProps {
  property: {
    name: string
    address: string
    neighborhood: string | null
    city: string
    entry_code: string | null
    building_entry_code: string | null
    youtube_tutorial_url: string | null
    canva_design_url: string | null
    entry_instructions: string | null
    guest_links: GuestLink[] | null
  }
  booking: {
    check_in: string
    check_out: string
    guest_name: string | null
  } | null
  guideText?: string | null
  canvaEmbedUrl?: string | null
}

export function GuestCheckIn({ property, booking, guideText, canvaEmbedUrl }: GuestCheckInProps) {
  const [codeVisible, setCodeVisible] = useState(false)
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    if (!booking) {
      setCodeVisible(true)
      return
    }

    function checkTimeGate() {
      const checkInDate = new Date(booking!.check_in + 'T14:00:00+03:00')
      const gateOpens = new Date(checkInDate.getTime() - 24 * 60 * 60 * 1000)
      const now = new Date()

      if (now >= gateOpens) {
        setCodeVisible(true)
        setCountdown('')
      } else {
        setCodeVisible(false)
        const diff = gateOpens.getTime() - now.getTime()
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        setCountdown(`${hours}h ${minutes}m`)
      }
    }

    checkTimeGate()
    const interval = setInterval(checkTimeGate, 60_000)
    return () => clearInterval(interval)
  }, [booking])

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[#FAFAFA]">
      {/* Header — navy with Ledger feel */}
      <div className="bg-primary px-5 py-6 text-primary-foreground">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70">Welcome to</p>
        <h1 className="mt-1 text-xl font-semibold">{property.name}</h1>
        <div className="mt-2 flex items-center gap-1.5 text-sm opacity-80">
          <MapPin className="h-3.5 w-3.5" />
          {property.address}, {property.neighborhood || property.city}
        </div>
        {booking?.guest_name && (
          <p className="mt-3 text-sm opacity-90">
            Hello, {booking.guest_name}!
          </p>
        )}
      </div>

      <div className="space-y-4 p-4">
        {/* Apartment guide — embedded Canva viewer (browsable inline). The
            published design renders live, so the host's Canva edits appear
            automatically. Fallback link opens the full guide in a new tab. */}
        {canvaEmbedUrl && (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <BookOpen className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold">{property.name} Guide</p>
            </div>
            <div className="relative w-full" style={{ height: '70vh', minHeight: 480, maxHeight: 600 }}>
              <iframe
                src={canvaEmbedUrl}
                title={`${property.name} Guide`}
                loading="lazy"
                allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                className="absolute inset-0 h-full w-full"
                style={{ border: 0 }}
              />
            </div>
            {property.canva_design_url && (
              <a
                href={property.canva_design_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-accent hover:underline"
              >
                Open full guide in Canva ↗
              </a>
            )}
          </div>
        )}

        {/* Entry Code — Time-Gated */}
        <div className={`rounded-[10px] border p-6 text-center shadow-sm ${
          codeVisible ? 'border-status-safe/30 bg-[hsl(152_54%_25%/0.04)]' : 'border-border bg-card'
        }`}>
          {codeVisible && property.entry_code ? (
            <div className="animate-code-reveal">
              <KeyRound className="mx-auto h-7 w-7 text-status-safe" />
              {/* Chronological order: building code first (you enter the building),
                  then the door code, then the apartment-specific instructions. */}
              {property.building_entry_code && (
                <div className="mt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Building Code</p>
                  <p className="mt-0.5 font-mono text-3xl font-bold tracking-[0.2em] text-foreground">{property.building_entry_code}</p>
                </div>
              )}
              <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-status-safe">Door Code</p>
              <p className="mt-1 font-mono text-5xl font-bold tracking-[0.25em] text-foreground">
                {property.entry_code}
              </p>
              {property.entry_instructions ? (
                <p dir="auto" className="mt-3 whitespace-pre-line text-xs text-muted-foreground">
                  {property.entry_instructions}
                </p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  {canvaEmbedUrl
                    ? 'Step-by-step entry instructions are in your guide below.'
                    : property.building_entry_code
                      ? 'Use the building code at the main entrance, then the door code on the Simplex lock.'
                      : 'Use this code on the Simplex lock at the front door.'}
                </p>
              )}
            </div>
          ) : (
            <>
              <Lock className="mx-auto h-7 w-7 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">Entry code available soon</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your entry code will be revealed 24 hours before check-in.
              </p>
              {countdown && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-badge)] bg-muted px-2.5 py-1 font-mono text-sm">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {countdown}
                </div>
              )}
              {booking && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Check-in: {new Date(booking.check_in).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              )}
            </>
          )}
        </div>

        {/* Entry Video — gated behind the code reveal because it shows the door code */}
        {codeVisible && property.entry_code && property.youtube_tutorial_url && (
          <a
            href={property.youtube_tutorial_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <div className="flex items-center gap-4 rounded-[10px] border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[hsl(0_72%_51%/0.08)]">
                <Play className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold">Entry Video Guide</p>
                <p className="text-xs text-muted-foreground">
                  Watch how to get in — step-by-step
                </p>
              </div>
            </div>
          </a>
        )}

        {/* Custom guest links — each hidden until reveal if flagged */}
        {(property.guest_links ?? [])
          .filter((link) => link.url && (!link.hide_until_revealed || (codeVisible && property.entry_code)))
          .map((link, i) => (
            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="block">
              <div className="flex items-center gap-4 rounded-[10px] border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[hsl(var(--accent)/0.12)]">
                  <Link2 className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{link.label || 'Link'}</p>
                </div>
              </div>
            </a>
          ))}

        {/* AI Guest Guide */}
        {guideText && (
          <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your Guide</p>
            <div dir="auto" className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {guideText}
            </div>
          </div>
        )}

        {/* Booking Info */}
        {booking && (
          <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your Stay</p>
            <div className="mt-2 flex justify-between">
              <div>
                <p className="text-sm font-medium">Check-in</p>
                <p className="text-xs text-muted-foreground">{new Date(booking.check_in).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">Check-out</p>
                <p className="text-xs text-muted-foreground">{new Date(booking.check_out).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 py-4">
          <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" className="h-5 w-auto opacity-80" />
          <p className="text-xs text-muted-foreground">
            Marcus Properties
          </p>
        </div>
      </div>
    </div>
  )
}
