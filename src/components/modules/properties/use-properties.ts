'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface UsePropertiesOptions {
  ownerId?: string
  activeOnly?: boolean
}

export function useProperties({ ownerId, activeOnly = true }: UsePropertiesOptions = {}) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['properties', { ownerId, activeOnly }],
    queryFn: async () => {
      let query = supabase
        .from('properties')
        .select('*, owners(full_name, profile)')
        .order('name')

      if (ownerId) query = query.eq('owner_id', ownerId)
      if (activeOnly) query = query.eq('is_active', true)

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useProperty(id: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*, owners(full_name, email, profile)')
        .eq('id', id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}
