'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Calendar,
  Receipt,
  FileBarChart,
  Menu,
  Users,
  Building2,
  ClipboardList,
  Package,
  MessageSquare,
  FileText,
  Settings,
  LogOut,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { signOut } from '@/app/login/actions'

/** Primary bottom nav — Ledger's entity-first tabs */
const bottomTabs = [
  { href: '/dashboard', label: 'Portfolio', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/bills', label: 'Bills', icon: Receipt },
  { href: '/financials', label: 'Reports', icon: FileBarChart },
]

/** Secondary nav — accessible via hamburger menu */
const menuItems = [
  { href: '/dashboard', label: 'Portfolio', icon: LayoutDashboard },
  { href: '/properties', label: 'Properties', icon: Building2 },
  { href: '/owners', label: 'Owners', icon: Users },
  { href: '/tasks', label: 'Tasks', icon: ClipboardList },
  { href: '/bills', label: 'Bills', icon: Receipt },
  { href: '/financials', label: 'Financials', icon: FileBarChart },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/contractors', label: 'Contractors', icon: Users },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/vault', label: 'Vault', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function LedgerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top header — compact, financial feel */}
      <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-3">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
              <Menu className="h-4.5 w-4.5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex h-12 items-center justify-between border-b px-4">
                <span className="text-sm font-bold tracking-tight text-primary">ApartmentOS</span>
              </div>
              <nav className="flex flex-col gap-0.5 p-2">
                {menuItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  )
                })}
                <div className="mt-4 border-t pt-2">
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </form>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
          <span className="text-sm font-bold tracking-tight text-primary">
            ApartmentOS
          </span>
        </div>
        <span className="text-xs text-muted-foreground">Marcus Properties</span>
      </header>

      {/* Main content — scrollable */}
      <main className="flex-1 overflow-auto pb-20">
        <div className="mx-auto max-w-2xl px-4 py-4 lg:max-w-5xl lg:py-6">
          {children}
        </div>
      </main>

      {/* Bottom nav — Ledger's 4 entity tabs */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg">
          {bottomTabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <tab.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                {tab.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
