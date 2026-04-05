import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { LedgerShell } from '@/components/layout/shells/ledger-shell'
import { prefetchAdminData } from '@/lib/admin-prefetch'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 min — data is small, cache aggressively
      },
    },
  })

  // Prefetch ALL admin data in one parallel batch on layout load
  const data = await prefetchAdminData()

  // Hydrate each dataset into React Query cache
  queryClient.setQueryData(['properties'], data.properties)
  queryClient.setQueryData(['owners'], data.owners)
  queryClient.setQueryData(['bookings'], data.bookings)
  queryClient.setQueryData(['bills'], data.bills)
  queryClient.setQueryData(['tasks'], data.tasks)
  queryClient.setQueryData(['contractors'], data.contractors)
  queryClient.setQueryData(['inventory'], data.inventory)
  queryClient.setQueryData(['documents'], data.documents)
  queryClient.setQueryData(['revenue_tracking'], data.revenueTracking)
  queryClient.setQueryData(['seasonal_templates'], data.seasonalTemplates)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LedgerShell>{children}</LedgerShell>
    </HydrationBoundary>
  )
}
