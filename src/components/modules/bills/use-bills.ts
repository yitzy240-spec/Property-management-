'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Bill, BillStatus } from '@/types'

interface UseBillsOptions {
  propertyId?: string
  status?: BillStatus
  limit?: number
}

export function useBills({ propertyId, status, limit = 50 }: UseBillsOptions = {}) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['bills', { propertyId, status, limit }],
    queryFn: async () => {
      let query = supabase
        .from('bills')
        .select('*, properties(name)')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (propertyId) query = query.eq('property_id', propertyId)
      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useBillAction() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ billId, action }: { billId: string; action: 'approved' | 'rejected' }) => {
      const { error } = await supabase
        .from('bills')
        .update({
          status: action,
          approved_at: action === 'approved' ? new Date().toISOString() : null,
        })
        .eq('id', billId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
    },
  })
}
