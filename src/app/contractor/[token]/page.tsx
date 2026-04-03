import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyMagicLinkToken } from '@/lib/magic-links'
import { ContractorTaskView } from '@/components/features/contractor-task-view'

export default async function ContractorMagicLinkPage({
  params,
}: {
  params: { token: string }
}) {
  try {
    // Verify JWT
    const payload = await verifyMagicLinkToken(params.token)

    // Cross-check against magic_links table (supports revocation)
    const serviceClient = createServiceClient()
    const { data: magicLink } = await serviceClient
      .from('magic_links')
      .select('*')
      .eq('token', params.token)
      .eq('is_used', false)
      .single()

    if (!magicLink) {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-xl font-bold">Link Expired</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This link has been used or has expired. Contact your manager for a new one.
            </p>
          </div>
        </div>
      )
    }

    // Fetch property + task data
    const { data: property } = await serviceClient
      .from('properties')
      .select('id, name, address, entry_code, youtube_tutorial_url')
      .eq('id', payload.property_id)
      .single()

    if (!property) notFound()

    let task = null
    let checklistItems: { id: string; label: string; is_completed: boolean; sort_order: number }[] = []

    if (payload.task_id) {
      const { data: taskData } = await serviceClient
        .from('tasks')
        .select('*')
        .eq('id', payload.task_id)
        .single()
      task = taskData

      const { data: items } = await serviceClient
        .from('task_checklist_items')
        .select('*')
        .eq('task_id', payload.task_id)
        .order('sort_order')
      checklistItems = items ?? []
    }

    return (
      <ContractorTaskView
        token={params.token}
        property={property}
        task={task}
        checklistItems={checklistItems}
        magicLinkId={magicLink.id}
      />
    )
  } catch {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold">Invalid Link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is invalid or has expired.
          </p>
        </div>
      </div>
    )
  }
}
