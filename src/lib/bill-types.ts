/**
 * Display labels for bill_type values stored in the DB.
 * The DB uses short codes ('iec', 'vaad_bayit', etc.); humans see
 * the labels here. Single source of truth — admin pages, owner portal,
 * invoice compiler, edit drawer should all import this.
 */
export const BILL_TYPE_LABELS: Record<string, string> = {
  arnona: 'Arnona',
  iec: 'Electricity (IEC)',
  water: 'Water',
  gas: 'Gas',
  internet: 'Internet',
  vaad_bayit: 'Va\'ad Bayit (HOA)',
  cleaning: 'Cleaning',
  other: 'Other',
}

export function billTypeLabel(billType: string | null | undefined): string {
  if (!billType) return 'Bill'
  return BILL_TYPE_LABELS[billType] || billType.replace('_', ' ')
}
