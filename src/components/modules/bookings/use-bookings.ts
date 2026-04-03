'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface UseBookingsOptions {
  propertyId?: string
  upcoming?: boolean
  limit?: number
}

export function useBookings({ propertyId, upcoming = false, limit = 20 }: UseBookingsOptions = {}) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['bookings', { propertyId, upcoming, limit }],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select('*, properties(name)')
        .order('check_in', { ascending: upcoming })
        .limit(limit)

      if (propertyId) query = query.eq('property_id', propertyId)
      if (upcoming) query = query.gte('check_in', new Date().toISOString().split('T')[0])

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}
