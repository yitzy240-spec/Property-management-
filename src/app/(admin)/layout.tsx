import { LedgerShell } from '@/components/layout/shells/ledger-shell'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <LedgerShell>{children}</LedgerShell>
}
