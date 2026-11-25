import { z } from 'zod'
import { AgentError, type ServiceClient } from './core'
import type { ChecklistKey } from '@/types'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const checklistItem = z.enum([
  'electricity_working',
  'run_sinks',
  'run_showers',
  'flush_toilets',
  'refrigerator_freezer',
  'soap_stock',
  'boiler_off',
  'washer_door_open',
  'dryer_lint',
  'bedrooms_no_mold',
  'check_mailbox',
])

export const VisitCreate = z
  .object({
    property_id: z.string().uuid(),
    visited_at: date.nullish(),
    checklist: z.record(z.string(), z.boolean()).default({}),
    note: z.string().max(5000).nullish(),
    admin_note: z.string().max(5000).nullish(),
  })
  .strict()

export const VisitPatch = z
  .object({
    visited_at: date.nullable(),
    checklist: z.record(z.string(), z.boolean()),
    note: z.string().max(5000).nullable(),
    admin_note: z.string().max(5000).nullable(),
  })
  .partial()
  .strict()

export const VISIT_COLUMNS =
  'id, property_id, visited_at, checklist, note, admin_note, created_by, created_at, properties(name)'

export function serializeVisit(v: Record<string, unknown>, media: unknown[] = []) {
  return {
    id: v.id,
    property_id: v.property_id,
    property_name: (v.properties as { name?: string } | null)?.name ?? null,
    visited_at: v.visited_at,
    checklist: v.checklist ?? {},
    note: v.note ?? null,
    admin_note: v.admin_note ?? null,
    created_by: v.created_by,
    created_at: v.created_at,
    media,
  }
}

export async function loadVisit(db: ServiceClient, id: string) {
  const { data, error } = await db.from('visits').select(VISIT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new AgentError(500, error.message)
  if (!data) throw new AgentError(404, 'Visit not found.')
  
  // Load media
  const { data: media } = await db
    .from('visit_media')
    .select('id, file_path, file_type, is_private, created_at')
    .eq('visit_id', id)
    .order('created_at')
  
  return serializeVisit(data as unknown as Record<string, unknown>, media ?? [])
}

/**
 * Generate signed URLs for visit media.
 * Returns array of media objects with signed_url field added.
 */
export async function generateMediaSignedUrls(
  serviceClient: { storage: { from: (bucket: string) => { createSignedUrl: (path: string, seconds: number) => Promise<{ data: { signedUrl: string } | null; error: unknown }> } } },
  media: Array<{ id: string; file_path: string; file_type: string; is_private: boolean; created_at: string }>
) {
  return await Promise.all(
    media.map(async (m) => {
      let signedUrl: string | null = null
      
      const { data: urlData, error: urlError } = await serviceClient.storage
        .from('visit-media')
        .createSignedUrl(m.file_path, 3600) // 1 hour expiry
      
      if (!urlError && urlData) {
        signedUrl = urlData.signedUrl
      }
      
      return {
        ...m,
        signed_url: signedUrl,
      }
    })
  )
}
