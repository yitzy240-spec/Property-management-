export const dynamic = 'force-dynamic'

import { OwnerForm } from '@/components/features/owner-form'

export default function NewOwnerPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add Owner</h1>
        <p className="text-sm text-muted-foreground">
          Create a new property owner and assign their portal profile.
        </p>
      </div>
      <OwnerForm />
    </div>
  )
}
