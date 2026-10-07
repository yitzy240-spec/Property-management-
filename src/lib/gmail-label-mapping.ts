/**
 * Gmail label → property routing for the parse-bills cron.
 *
 * Stored as one JSON object in app_settings (key below), shaped
 * `{ "<Gmail label name>": "<property uuid>" }`. The cron only scans labels
 * that appear here, so a new property's bills are not picked up until its
 * label is added (editable on the property edit page).
 */
export const GMAIL_LABEL_MAPPING_KEY = 'gmail_bill_label_mapping'

export type LabelMapping = Record<string, string>

export function parseLabelMapping(raw: string | null | undefined): LabelMapping {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as LabelMapping) : {}
  } catch {
    return {}
  }
}

export function labelsForProperty(mapping: LabelMapping, propertyId: string): string[] {
  return Object.keys(mapping)
    .filter(label => mapping[label] === propertyId)
    .sort()
}

/**
 * Replace the labels routed to `propertyId`. A label already routed to a
 * different property is reported as a conflict and left untouched — one
 * label can only feed one property.
 */
export function setLabelsForProperty(
  mapping: LabelMapping,
  propertyId: string,
  labels: string[],
): { mapping: LabelMapping; conflicts: string[] } {
  const wanted = Array.from(new Set(labels.map(l => l.trim()).filter(Boolean)))
  const next: LabelMapping = {}
  for (const [label, pid] of Object.entries(mapping)) {
    if (pid !== propertyId) next[label] = pid
  }
  const conflicts: string[] = []
  for (const label of wanted) {
    if (next[label]) conflicts.push(label)
    else next[label] = propertyId
  }
  return { mapping: next, conflicts }
}
