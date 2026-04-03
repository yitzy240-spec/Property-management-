export default function GuestCheckInPage({
  params,
}: {
  params: { token: string }
}) {
  return (
    <div className="mx-auto max-w-lg p-4">
      <h1 className="text-2xl font-bold">Welcome!</h1>
      {/* Guest check-in page — to be built:
        - Canva design embed (property-specific)
        - Entry code: TIME-GATED — hidden until 24h before check-in
          * Page is sent ~1 week before arrival so guests can review
          * Shows "Your entry code will be available [date/time]" until gate lifts
          * Code reveals automatically based on booking.check_in - 24h
          * Reason: property may still be occupied by previous guest
        - YouTube video guide
        - Property-specific instructions
      */}
    </div>
  )
}
