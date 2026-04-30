import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, AuthError } from '@/lib/auth'

/**
 * GET /api/admin/cleanup-vault-orphans  (admin OR cron-secret)
 *
 * Walks the documents storage bucket under the vault/ prefix and reports
 * any objects that have no corresponding row in the documents table —
 * i.e. orphan files left behind when an upload partially failed.
 *
 * Default = dry run (returns the orphan list, makes no changes).
 * Pass ?delete=true to actually remove the orphan storage objects.
 */
export async function GET(request: Request) {
  try {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      await requireAdmin()
    }

    const url = new URL(request.url)
    const apply = url.searchParams.get('delete') === 'true'

    const serviceClient = createServiceClient()

    // List all objects under vault/ — Storage list returns max 1000 by
    // default; explicit limit + sort to be deterministic.
    const { data: storageList, error: listError } = await serviceClient.storage
      .from('documents')
      .list('vault', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } })
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 })
    }

    const storagePaths = (storageList ?? [])
      .filter(o => o.name && !o.name.endsWith('/'))
      .map(o => `vault/${o.name}`)

    if (storagePaths.length === 0) {
      return NextResponse.json({ scanned: 0, orphans: [], deleted: 0 })
    }

    // Pull every documents.storage_path that uses the vault prefix; compare.
    const { data: rows, error: queryError } = await serviceClient
      .from('documents')
      .select('storage_path')
      .like('storage_path', 'vault/%')
    if (queryError) {
      return NextResponse.json({ error: queryError.message }, { status: 500 })
    }

    const tracked = new Set((rows ?? []).map(r => r.storage_path).filter(Boolean) as string[])
    const orphans = storagePaths.filter(p => !tracked.has(p))

    if (apply && orphans.length > 0) {
      const { error: removeError } = await serviceClient.storage
        .from('documents')
        .remove(orphans)
      if (removeError) {
        return NextResponse.json(
          { error: removeError.message, orphans, deleted: 0 },
          { status: 500 },
        )
      }
      return NextResponse.json({
        scanned: storagePaths.length,
        orphans,
        deleted: orphans.length,
      })
    }

    return NextResponse.json({
      dryRun: !apply,
      scanned: storagePaths.length,
      orphans,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const e = err as Error
    return NextResponse.json({ error: e?.message ?? String(err) }, { status: 500 })
  }
}
