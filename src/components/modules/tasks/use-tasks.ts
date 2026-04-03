'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { TaskStatus } from '@/types'

interface UseTasksOptions {
  propertyId?: string
  contractorId?: string
  status?: TaskStatus | TaskStatus[]
  limit?: number
}

export function useTasks({ propertyId, contractorId, status, limit = 50 }: UseTasksOptions = {}) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['tasks', { propertyId, contractorId, status, limit }],
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select('*, properties(name), contractors(name)')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (propertyId) query = query.eq('property_id', propertyId)
      if (contractorId) query = query.eq('contractor_id', contractorId)
      if (status) {
        if (Array.isArray(status)) {
          query = query.in('status', status)
        } else {
          query = query.eq('status', status)
        }
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}
