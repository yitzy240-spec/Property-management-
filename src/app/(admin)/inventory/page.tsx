export const dynamic = 'force-dynamic'

import { AlertTriangle, Package } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { formatDateJerusalem } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'
import { LinenForecast } from '@/components/features/linen-forecast'
import { InventoryAddButton, InventoryAdjust, InventoryDeleteButton, LaundryBatchButton, LaundryReturnButton } from '@/components/features/inventory-manage'
import { LaundryPickupButton } from '@/components/features/laundry-pickup'

export default async function InventoryPage() {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: inventory } = await serviceClient
    .from('inventory_items')
    .select('*, properties(name)')
    .order('item_name')

  const lowStockItems = inventory?.filter(
    (item) => item.par_level && item.quantity_in_closet < item.par_level
  ) ?? []

  const { data: allProperties } = await serviceClient
    .from('properties')
    .select('id, name, address')
    .eq('is_active', true)
    .order('name')

  const lowStockForPickup = lowStockItems.map(item => ({
    propertyName: (item.properties as { name: string } | null)?.name || 'Unknown',
    itemName: item.item_name,
    quantity: item.quantity_in_closet,
    parLevel: item.par_level,
  }))

  const { data: laundryBatches } = await serviceClient
    .from('laundry_batches')
    .select('*, properties(name)')
    .is('returned_at', null)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Inventory & Laundry</h1>
          <p className="text-xs text-muted-foreground">
            Track linens across properties and manage laundry pickups.
          </p>
        </div>
        <InventoryAddButton />
      </div>

      {/* AI Linen Forecast */}
      <LinenForecast />

      {/* Par Level Alerts */}
      {lowStockItems.length > 0 && (
        <div className="rounded-[10px] border border-status-warning/30 bg-[hsl(38_92%_50%/0.04)] p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-warning" />
            <p className="text-xs font-semibold text-foreground">Low Stock ({lowStockItems.length})</p>
          </div>
          <div className="space-y-2">
            {lowStockItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground">
                  {(item.properties as { name: string } | null)?.name} — {item.item_name}
                </span>
                <span className="font-mono text-xs text-status-warning">
                  {item.quantity_in_closet} / {item.par_level}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Linen Inventory
        </p>

        {inventory && inventory.length > 0 ? (
          <div className="space-y-4">
            {(() => {
              const grouped = {} as { [key: string]: typeof inventory }
              for (const item of inventory) {
                const propName = (item.properties as { name: string } | null)?.name || 'Unassigned'
                if (!grouped[propName]) grouped[propName] = []
                grouped[propName].push(item)
              }
              return Object.entries(grouped).map(([propName, items]) => (
                <div key={propName} className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
                  <div className="border-b border-border bg-muted/30 px-4 py-2">
                    <p className="text-xs font-semibold">{propName}</p>
                  </div>
                  <div className="grid grid-cols-6 gap-0 border-b border-border px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <span className="col-span-2">Item</span>
                    <span className="text-center">Closet</span>
                    <span className="text-center">Laundry</span>
                    <span className="text-center">Dmg</span>
                    <span></span>
                  </div>
                  {items.map((item, i) => {
                    const belowPar = item.par_level && item.quantity_in_closet < item.par_level
                    return (
                      <div key={item.id} className={`grid grid-cols-6 items-center gap-0 px-4 py-2 ${i > 0 ? 'border-t border-border' : ''}`}>
                        <div className="col-span-2">
                          <p className="text-sm font-medium">{item.item_name}</p>
                        </div>
                        <div className={belowPar ? 'font-bold text-status-warning' : ''}>
                          <InventoryAdjust itemId={item.id} field="quantity_in_closet" currentValue={item.quantity_in_closet} />
                        </div>
                        <InventoryAdjust itemId={item.id} field="quantity_at_laundry" currentValue={item.quantity_at_laundry} />
                        <InventoryAdjust itemId={item.id} field="quantity_damaged" currentValue={item.quantity_damaged} />
                        <div className="flex justify-center">
                          <InventoryDeleteButton itemId={item.id} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            })()}
          </div>
        ) : (
          <div className="rounded-[10px] border border-border bg-card py-10 text-center shadow-sm">
            <Package className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No inventory items tracked yet</p>
          </div>
        )}
      </section>

      {/* Active Laundry Batches */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Active Laundry
          </p>
          <div className="flex items-center gap-2">
            <LaundryBatchButton />
            <LaundryPickupButton
              properties={(allProperties ?? []).map(p => ({ id: p.id, name: p.name, address: p.address }))}
              lowStockItems={lowStockForPickup}
            />
          </div>
        </div>

        {laundryBatches && laundryBatches.length > 0 ? (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
            {laundryBatches.map((batch, i) => {
              const batchItems = (batch.items as { item_name: string; quantity: number }[]) || []
              return (
                <details key={batch.id} className={i > 0 ? 'border-t border-border' : ''}>
                  <summary className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">
                        {(batch.properties as { name: string } | null)?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Sent: {batch.sent_at ? formatDateJerusalem(batch.sent_at) : 'Not sent'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {batch.laundry_provider_notified && (
                        <StatusBadge status="safe" label="Notified" size="sm" />
                      )}
                      <span className="font-mono text-xs text-muted-foreground">
                        {batchItems.length} items
                      </span>
                      <LaundryReturnButton batchId={batch.id} propertyId={batch.property_id} items={batchItems} />
                    </div>
                  </summary>
                  <div className="border-t border-border bg-muted/20 px-4 py-2">
                    {batchItems.map((item, j) => (
                      <div key={j} className="flex justify-between py-0.5 text-xs">
                        <span>{item.item_name}</span>
                        <span className="font-mono text-muted-foreground">x {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )
            })}
          </div>
        ) : (
          <div className="rounded-[10px] border border-border bg-card py-6 text-center text-sm text-muted-foreground shadow-sm">
            No pending laundry batches
          </div>
        )}
      </section>
    </div>
  )
}
