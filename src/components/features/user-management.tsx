'use client'

import { useState, useEffect } from 'react'
import { UserPlus, Trash2, Shield, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface AppUser {
  id: string
  email: string
  created_at: string
  last_sign_in: string | null
}

export function UserManagement() {
  const [admins, setAdmins] = useState<AppUser[]>([])
  const [owners, setOwners] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<string>('admin')
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      if (res.ok) {
        const data = await res.json()
        setAdmins(data.admins || [])
        setOwners(data.owners || [])
      } else if (res.status === 403) {
        // User is authenticated but not admin — show empty state with hint
        toast.error('Admin role not set. Run the SQL in Supabase to grant admin access.')
      }
    } catch {
      // Network error — ignore
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!newEmail) return
    setSaving(true)

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, role: newRole }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to add user')
      }

      toast.success(data.message)
      setAddOpen(false)
      setNewEmail('')
      loadUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add user')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(userId: string) {
    setRemoving(userId)

    try {
      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }

      toast.success('User access removed')
      loadUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove user')
    } finally {
      setRemoving(null)
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="rounded-[10px] border border-border bg-card py-6 text-center text-sm text-muted-foreground shadow-sm">
        Loading users...
      </div>
    )
  }

  return (
    <div className="rounded-[10px] border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Team & Access</h3>
          <p className="text-xs text-muted-foreground">{admins.length} admins, {owners.length} owner logins</p>
        </div>
        <Drawer open={addOpen} onOpenChange={setAddOpen}>
          <DrawerTrigger asChild>
            <Button size="sm" className="h-8 gap-1.5 text-xs bg-accent text-accent-foreground hover:bg-accent/90">
              <UserPlus className="h-3.5 w-3.5" />
              Add User
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Add User</DrawerTitle>
              <DrawerDescription>
                Add an admin team member or provision an owner login.
              </DrawerDescription>
            </DrawerHeader>
            <div className="space-y-4 p-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Email</Label>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  className="h-11"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v || 'admin')}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin — Full dashboard access</SelectItem>
                    <SelectItem value="owner">Owner — Portal access only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DrawerFooter>
              <Button onClick={handleAdd} disabled={saving || !newEmail} className="h-11 w-full">
                {saving ? 'Adding...' : 'Add User'}
              </Button>
              <DrawerClose asChild>
                <Button variant="outline">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>

      <div className="p-4">
        {/* Admins */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Shield className="mr-1 inline h-3 w-3" />
            Admins
          </p>
          {admins.length > 0 ? (
            <div className="space-y-2">
              {admins.map((user) => (
                <div key={user.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Last sign in: {formatDate(user.last_sign_in)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    disabled={removing === user.id}
                    onClick={() => handleRemove(user.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No admin users configured. Add yourself first.</p>
          )}
        </div>

        {/* Owners */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Users className="mr-1 inline h-3 w-3" />
            Owner Logins
          </p>
          {owners.length > 0 ? (
            <div className="space-y-2">
              {owners.map((user) => (
                <div key={user.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.last_sign_in ? `Last login: ${formatDate(user.last_sign_in)}` : 'Never logged in'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={user.last_sign_in ? 'safe' : 'neutral'}
                      label={user.last_sign_in ? 'Active' : 'Pending'}
                      size="sm"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      disabled={removing === user.id}
                      onClick={() => handleRemove(user.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No owner logins provisioned yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
