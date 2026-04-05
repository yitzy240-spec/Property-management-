'use client'

import { useState, useEffect } from 'react'
import { Clock, MapPin, Play, Lock, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface GuestCheckInProps {
  property: {
    name: string
    address: string
    neighborhood: string | null
    city: string
    entry_code: string | null
    youtube_tutorial_url: string | null
    canva_design_url: string | null
  }
  booking: {
    check_in: string
    check_out: string
    guest_name: string | null
  } | null
}

export function GuestCheckIn({ property, booking }: GuestCheckInProps) {
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
        {/* Canva Design Embed */}
        {property.canva_design_url && (
          <div className="overflow-hidden rounded-[10px] border border-border shadow-sm">
            <img
              src={property.canva_design_url}
              alt={`${property.name} guide`}
              className="w-full"
            />
          </div>
        )}

        {/* Entry Code — Time-Gated */}
        <div className={`rounded-[10px] border p-6 text-center shadow-sm ${
          codeVisible ? 'border-status-safe/30 bg-[hsl(152_54%_25%/0.04)]' : 'border-border bg-card'
        }`}>
          {codeVisible && property.entry_code ? (
            <>
              <KeyRound className="mx-auto h-7 w-7 text-status-safe" />
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-status-safe">Your Entry Code</p>
              <p className="mt-2 font-mono text-5xl font-bold tracking-[0.25em] text-foreground">
                {property.entry_code}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Use this code on the Simplex lock at the front door.
              </p>
            </>
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

        {/* Video Tutorial */}
        {property.youtube_tutorial_url && (
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
                <p className="text-sm font-semibold">Apartment Video Guide</p>
                <p className="text-xs text-muted-foreground">
                  Watch how to enter and use the apartment
                </p>
              </div>
            </div>
          </a>
        )}

        {/* Booking Info */}
        {booking && (
          <div className="rounded-[10px] border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your Stay</p>
            <div className="mt-2 flex justify-between">
              <div>
                <p className="text-sm font-medium">Check-in</p>
                <p className="font-mono text-xs text-muted-foreground">{booking.check_in}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">Check-out</p>
                <p className="font-mono text-xs text-muted-foreground">{booking.check_out}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 py-4">
          <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" className="h-5 w-auto opacity-50" />
          <p className="text-xs text-muted-foreground">
            Marcus Properties
          </p>
        </div>
      </div>
    </div>
  )
}
