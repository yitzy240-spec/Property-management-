'use client'

import { useState, useEffect } from 'react'
import { Clock, MapPin, Play, Lock, KeyRound } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
      setCodeVisible(true) // No booking = show code (admin preview)
      return
    }

    function checkTimeGate() {
      const checkInDate = new Date(booking!.check_in + 'T14:00:00+03:00') // 2pm Jerusalem
      const gateOpens = new Date(checkInDate.getTime() - 24 * 60 * 60 * 1000) // 24h before
      const now = new Date()

      if (now >= gateOpens) {
        setCodeVisible(true)
        setCountdown('')
      } else {
        setCodeVisible(false)
        // Calculate countdown
        const diff = gateOpens.getTime() - now.getTime()
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        setCountdown(`${hours}h ${minutes}m`)
      }
    }

    checkTimeGate()
    const interval = setInterval(checkTimeGate, 60_000) // Update every minute
    return () => clearInterval(interval)
  }, [booking])

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-background">
      {/* Header */}
      <div className="bg-primary p-6 text-primary-foreground">
        <p className="text-xs font-medium opacity-80">Welcome to</p>
        <h1 className="mt-1 text-2xl font-bold">{property.name}</h1>
        <div className="mt-2 flex items-center gap-1.5 text-sm opacity-90">
          <MapPin className="h-3.5 w-3.5" />
          {property.address}, {property.neighborhood || property.city}
        </div>
        {booking?.guest_name && (
          <p className="mt-3 text-sm">
            Hello, {booking.guest_name}!
          </p>
        )}
      </div>

      <div className="space-y-4 p-4">
        {/* Canva Design Embed */}
        {property.canva_design_url && (
          <Card>
            <CardContent className="p-0">
              <img
                src={property.canva_design_url}
                alt={`${property.name} guide`}
                className="w-full rounded-lg"
              />
            </CardContent>
          </Card>
        )}

        {/* Entry Code — Time-Gated */}
        <Card className={codeVisible ? 'border-status-safe/30 bg-status-safe/5' : ''}>
          <CardContent className="p-6 text-center">
            {codeVisible && property.entry_code ? (
              <>
                <KeyRound className="mx-auto h-8 w-8 text-status-safe" />
                <p className="mt-2 text-xs font-medium text-status-safe">Your Entry Code</p>
                <p className="mt-2 text-5xl font-bold font-mono tracking-[0.25em] text-foreground">
                  {property.entry_code}
                </p>
                <p className="mt-3 text-xs text-status-safe">
                  Use this code on the Simplex lock at the front door.
                </p>
              </>
            ) : (
              <>
                <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Entry code available soon</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your entry code will be revealed 24 hours before check-in.
                </p>
                {countdown && (
                  <Badge variant="secondary" className="mt-3 gap-1.5 text-sm font-mono">
                    <Clock className="h-3.5 w-3.5" />
                    {countdown}
                  </Badge>
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
          </CardContent>
        </Card>

        {/* Video Tutorial */}
        {property.youtube_tutorial_url && (
          <a
            href={property.youtube_tutorial_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                  <Play className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Apartment Video Guide</p>
                  <p className="text-xs text-muted-foreground">
                    Watch how to enter and use the apartment
                  </p>
                </div>
              </CardContent>
            </Card>
          </a>
        )}

        {/* Booking Info */}
        {booking && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Your Stay</p>
              <div className="mt-2 flex justify-between text-sm">
                <div>
                  <p className="font-medium">Check-in</p>
                  <p className="text-muted-foreground">{booking.check_in}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">Check-out</p>
                  <p className="text-muted-foreground">{booking.check_out}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="py-4 text-center text-xs text-muted-foreground">
          Managed by Marcus Properties · ApartmentOS
        </p>
      </div>
    </div>
  )
}
