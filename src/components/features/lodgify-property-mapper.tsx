'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Link2, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { createClient } from '@/lib/supabase/client'

interface LodgifyProperty {
  id: number
  name: string
  status: string
}

interface LocalProperty {
  id: string
  name: string
  lodgify_property_id: string | null
}

export function LodgifyPropertyMapper() {
  const supabase = createClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lodgifyProps, setLodgifyProps] = useState<LodgifyProperty[]>([])
  const [localProps, setLocalProps] = useState<LocalProperty[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    async function loadLocal() {
      const { data } = await supabase
        .from('properties')
        .select('id, name, lodgify_property_id')
        .eq('is_active', true)
        .order('name')
      setLocalProps((data as LocalProperty[]) ?? [])
    }
    loadLocal()
  }, [])

  async function fetchLodgify() {
    setLoading(true)
    try {
      const res = await fetch('/api/lodgify/properties')
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to fetch')
      }
      const { properties } = await res.json()
      setLodgifyProps(properties)
      toast.success(`Found ${properties.length} Lodgify properties`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch Lodgify properties')
    } finally {
      setLoading(false)
    }
  }

  async function linkProperty(localId: string, lodgifyId: number) {
    setSaving(localId)
    const { error } = await supabase
      .from('properties')
      .update({ lodgify_property_id: String(lodgifyId) })
      .eq('id', localId)

    if (error) {
      toast.error('Failed to link property')
    } else {
      setLocalProps(prev =>
        prev.map(p => p.id === localId ? { ...p, lodgify_property_id: String(lodgifyId) } : p)
      )
      toast.success('Property linked')
    }
    setSaving(null)
  }

  async function unlinkProperty(localId: string) {
    setSaving(localId)
    const { error } = await supabase
      .from('properties')
      .update({ lodgify_property_id: null })
      .eq('id', localId)

    if (error) {
      toast.error('Failed to unlink')
    } else {
      setLocalProps(prev =>
        prev.map(p => p.id === localId ? { ...p, lodgify_property_id: null } : p)
      )
      toast.success('Property unlinked')
    }
    setSaving(null)
  }

  const linkedCount = localProps.filter(p => p.lodgify_property_id).length

  return (
    <div className="rounded-[10px] border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Lodgify Property Mapping</h3>
          <p className="text-xs text-muted-foreground">
            {linkedCount}/{localProps.length} properties linked
          </p>
        </div>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => { if (lodgifyProps.length === 0) fetchLodgify() }}>
              <Link2 className="h-3.5 w-3.5" />
              Map
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Link Properties to Lodgify</DrawerTitle>
            </DrawerHeader>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              {/* Refresh button */}
              <Button
                variant="outline"
                size="sm"
                className="mb-4 w-full gap-1.5"
                onClick={fetchLodgify}
                disabled={loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Fetching...' : 'Refresh from Lodgify'}
              </Button>

              {lodgifyProps.length === 0 && !loading && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Click refresh to fetch your Lodgify properties.
                </p>
              )}

              {/* Property mapping list */}
              {localProps.map((local) => {
                const linkedLodgify = lodgifyProps.find(lp => String(lp.id) === local.lodgify_property_id)
                const isLinked = !!local.lodgify_property_id

                return (
                  <div key={local.id} className="mb-3 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{local.name}</p>
                        {isLinked && linkedLodgify && (
                          <p className="text-xs text-muted-foreground">
                            Linked to: {linkedLodgify.name} (#{linkedLodgify.id})
                          </p>
                        )}
                        {isLinked && !linkedLodgify && (
                          <p className="font-mono text-xs text-muted-foreground">
                            ID: {local.lodgify_property_id}
                          </p>
                        )}
                      </div>
                      {isLinked ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          disabled={saving === local.id}
                          onClick={() => unlinkProperty(local.id)}
                        >
                          <Unlink className="h-3 w-3" />
                          Unlink
                        </Button>
                      ) : (
                        <StatusBadge status="warning" label="Not linked" size="sm" />
                      )}
                    </div>

                    {/* Lodgify options to link */}
                    {!isLinked && lodgifyProps.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {lodgifyProps
                          .filter(lp => !localProps.some(p => p.lodgify_property_id === String(lp.id)))
                          .map((lp) => (
                            <button
                              key={lp.id}
                              className="flex w-full items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                              disabled={saving === local.id}
                              onClick={() => linkProperty(local.id, lp.id)}
                            >
                              <span>{lp.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">#{lp.id}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Quick status of linked properties */}
      <div className="p-4">
        {localProps.length > 0 ? (
          <div className="space-y-1.5">
            {localProps.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span>{p.name}</span>
                {p.lodgify_property_id ? (
                  <StatusBadge status="safe" label="Linked" size="sm" />
                ) : (
                  <StatusBadge status="neutral" label="Not linked" size="sm" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">No properties</p>
        )}
      </div>
    </div>
  )
}
