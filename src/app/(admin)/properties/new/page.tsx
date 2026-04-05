export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PropertyForm } from '@/components/features/property-form'

export default function NewPropertyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/properties">
          <button className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Add Property</h1>
          <p className="text-xs text-muted-foreground">
            Create a new property listing.
          </p>
        </div>
      </div>
      <PropertyForm />
    </div>
  )
}
