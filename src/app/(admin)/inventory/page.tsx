export const dynamic = 'force-dynamic'

import { AlertTriangle, Package, Phone } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { formatDateJerusalem } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default async function InventoryPage() {
  const supabase = createServerSupabaseClient()

  const { data: inventory } = await supabase
    .from('inventory_items')
    .select('*, properties(name)')
    .order('item_name')

  // Check par level alerts
  const lowStockItems = inventory?.filter(
    (item) => item.par_level && item.quantity_in_closet < item.par_level
  ) ?? []

  // Get laundry batches
  const { data: laundryBatches } = await supabase
    .from('laundry_batches')
    .select('*, properties(name)')
    .is('returned_at', null)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventory & Laundry</h1>
        <p className="text-sm text-muted-foreground">
          Track linens across properties and manage laundry pickups.
        </p>
      </div>

      {/* Par Level Alerts */}
      {lowStockItems.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Low Stock Alerts ({lowStockItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-amber-900">
                    {(item.properties as { name: string } | null)?.name} — {item.item_name}
                  </span>
                  <Badge variant="outline" className="border-amber-400 text-amber-800">
                    {item.quantity_in_closet} / {item.par_level} min
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Linen Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          {inventory && inventory.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">In Closet</TableHead>
                  <TableHead className="text-center">At Laundry</TableHead>
                  <TableHead className="text-center">Damaged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item) => {
                  const belowPar = item.par_level && item.quantity_in_closet < item.par_level
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">
                        {(item.properties as { name: string } | null)?.name}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{item.item_name}</TableCell>
                      <TableCell className={`text-center font-mono ${belowPar ? 'font-bold text-amber-600' : ''}`}>
                        {item.quantity_in_closet}
                      </TableCell>
                      <TableCell className="text-center font-mono">{item.quantity_at_laundry}</TableCell>
                      <TableCell className="text-center font-mono text-muted-foreground">{item.quantity_damaged}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center py-8">
              <Package className="h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">No inventory items tracked yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Laundry Batches */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Active Laundry Batches</CardTitle>
            <a href="https://wa.me/?text=Laundry%20pickup%20request%20-%20ApartmentOS" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Phone className="mr-2 h-3.5 w-3.5" />
                Notify Laundry
              </Button>
            </a>
          </div>
        </CardHeader>
        <CardContent>
          {laundryBatches && laundryBatches.length > 0 ? (
            <div className="space-y-3">
              {laundryBatches.map((batch) => (
                <div key={batch.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
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
                        <Badge variant="secondary" className="text-[10px]">Notified</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {(batch.items as { item_name: string; quantity: number }[])?.length ?? 0} items
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No pending laundry batches
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
