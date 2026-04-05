export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Copy, ExternalLink, Pencil } from 'lucide-react'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { formatILS, formatDateJerusalem } from '@/lib/utils'

export default async function PropertyDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createServerSupabaseClient()
  const serviceClient = createServiceClient()

  const { data: property } = await supabase
    .from('properties')
    .select('*, owners(full_name, email, profile)')
    .eq('id', params.id)
    .single()

  if (!property) notFound()

  // Parallel data fetches for tabs
  const [
    { data: bookings },
    { data: bills },
    { data: tasks },
    { data: documents },
  ] = await Promise.all([
    serviceClient.from('bookings').select('*').eq('property_id', params.id).order('check_in', { ascending: false }).limit(10),
    serviceClient.from('bills').select('*').eq('property_id', params.id).order('created_at', { ascending: false }).limit(10),
    serviceClient.from('tasks').select('*, contractors(name)').eq('property_id', params.id).order('created_at', { ascending: false }).limit(10),
    serviceClient.from('documents').select('*').eq('property_id', params.id).order('created_at', { ascending: false }),
  ])

  const owner = property.owners as { full_name: string; email: string; profile: string } | null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/properties">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{property.name}</h1>
            <p className="text-sm text-muted-foreground">{property.address}</p>
          </div>
        </div>
        <Link href={`/properties/${params.id}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </Button>
        </Link>
      </div>

      {/* Info row */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary">{property.num_bedrooms} bed · {property.num_beds} beds</Badge>
        <Badge variant="secondary">{property.neighborhood || property.city}</Badge>
        {owner && (
          <Badge variant="outline">
            {owner.full_name} ({owner.profile})
          </Badge>
        )}
        <Badge variant="outline">{Math.round(property.commission_rate * 100)}% commission</Badge>
      </div>

      {/* Entry Code */}
      {property.entry_code && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Entry Code</p>
              <p className="text-3xl font-bold font-mono tracking-wider">{property.entry_code}</p>
              {property.entry_code_updated_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Updated {formatDateJerusalem(property.entry_code_updated_at)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {property.youtube_tutorial_url && (
                <a href={property.youtube_tutorial_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Tutorial
                  </Button>
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabbed Content */}
      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings">Bookings ({bookings?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="bills">Bills ({bills?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="documents">Vault ({documents?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="mt-4">
          {bookings && bookings.length > 0 ? (
            <div className="space-y-2">
              {bookings.map((booking) => (
                <Card key={booking.id}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{booking.guest_name || 'Guest'}</p>
                      <p className="text-xs text-muted-foreground">
                        {booking.check_in} → {booking.check_out}
                      </p>
                    </div>
                    <div className="text-right">
                      {booking.platform && (
                        <Badge variant="secondary" className="text-[10px]">{booking.platform}</Badge>
                      )}
                      {booking.gross_rental_agorot && (
                        <p className="mt-1 text-sm font-mono">{formatILS(booking.gross_rental_agorot)}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No bookings yet</p>
          )}
        </TabsContent>

        <TabsContent value="bills" className="mt-4">
          {bills && bills.length > 0 ? (
            <div className="space-y-2">
              {bills.map((bill) => (
                <Card key={bill.id}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium capitalize">{bill.bill_type.replace('_', ' ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {bill.due_date ? `Due ${bill.due_date}` : 'No due date'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={bill.status === 'approved' ? 'default' : bill.status === 'flagged' ? 'destructive' : 'secondary'}
                        className="text-[10px]"
                      >
                        {bill.status}
                      </Badge>
                      <p className="text-sm font-mono">{formatILS(bill.amount_agorot)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No bills yet</p>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          {tasks && tasks.length > 0 ? (
            <div className="space-y-2">
              {tasks.map((task) => (
                <Card key={task.id}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {(task.contractors as { name: string } | null)?.name || 'Unassigned'}
                        {task.due_date && ` · Due ${task.due_date}`}
                      </p>
                    </div>
                    <Badge
                      variant={task.status === 'completed' ? 'default' : task.status === 'in_progress' ? 'secondary' : 'outline'}
                      className="text-[10px]"
                    >
                      {task.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No tasks yet</p>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          {documents && documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{doc.category}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {doc.uploaded_by}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No documents yet</p>
          )}
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Generate Magic Link */}
      <Button className="w-full sm:w-auto">
        Generate Magic Link
      </Button>
    </div>
  )
}
