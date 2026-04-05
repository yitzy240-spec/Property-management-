export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { OwnerForm } from '@/components/features/owner-form'

export default function NewOwnerPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/owners">
          <button className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Add Owner</h1>
          <p className="text-xs text-muted-foreground">
            Create a new property owner and assign their portal profile.
          </p>
        </div>
      </div>
      <OwnerForm />
    </div>
  )
}
