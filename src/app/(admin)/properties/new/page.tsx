export const dynamic = 'force-dynamic'

import { PropertyForm } from '@/components/features/property-form'

export default function NewPropertyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add Property</h1>
        <p className="text-sm text-muted-foreground">
          Create a new property listing.
        </p>
      </div>
      <PropertyForm />
    </div>
  )
}
