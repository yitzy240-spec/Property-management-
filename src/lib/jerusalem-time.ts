/**
 * Compute UTC timestamps for "N days from now at HH:MM Jerusalem time".
 *
 * Handles DST transitions (IST ↔ IDT) by iterating: compute a candidate UTC,
 * verify the Jerusalem-local clock at that instant matches the target hour:minute,
 * and adjust by the offset delta if it doesn't. Two iterations are enough because
 * the Jerusalem offset only ever changes by ±60 minutes at a DST boundary.
 */

const JERUSALEM_TZ = 'Asia/Jerusalem'

function jerusalemOffsetMinutes(at: Date): number {
  const tzNamePart =
    new Intl.DateTimeFormat('en-US', { timeZone: JERUSALEM_TZ, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+2'
  const match = tzNamePart.match(/GMT([+-]\d+)(?::(\d+))?/)
  if (!match) return 120
  const hours = Number(match[1])
  const minutes = Number(match[2] ?? '0')
  return hours * 60 + (hours < 0 ? -minutes : minutes)
}

function jerusalemHourMinute(at: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: JERUSALEM_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minutePart = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return { hour: Number(hourPart), minute: Number(minutePart) }
}

export function jerusalemDateAt(days: number, hour: number, minute: number, from: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JERUSALEM_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(from)
  const y = Number(parts.find((p) => p.type === 'year')!.value)
  const m = Number(parts.find((p) => p.type === 'month')!.value)
  const d = Number(parts.find((p) => p.type === 'day')!.value)

  // Initial candidate: assume the offset at `from` applies at the target instant too.
  const initialOffset = jerusalemOffsetMinutes(from)
  let candidate = new Date(Date.UTC(y, m - 1, d + days, hour, minute, 0) - initialOffset * 60 * 1000)

  // Verify: does this UTC instant actually show as hour:minute in Jerusalem?
  // If not (DST crossover), adjust by the delta and recheck once.
  for (let i = 0; i < 2; i++) {
    const observed = jerusalemHourMinute(candidate)
    const observedMinutes = observed.hour * 60 + observed.minute
    const targetMinutes = hour * 60 + minute
    const deltaMin = targetMinutes - observedMinutes
    if (deltaMin === 0) break
    // Handle day-wrap: deltaMin can be near ±1440 if our offset estimate crossed midnight.
    const wrappedDelta = ((deltaMin + 720 + 1440) % 1440) - 720
    candidate = new Date(candidate.getTime() + wrappedDelta * 60 * 1000)
  }

  return candidate
}
