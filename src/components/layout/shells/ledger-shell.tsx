'use client'

import { useState, useEffect } from 'react'
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
  HardHat,
  Sparkles,
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

/** Secondary nav — only items NOT in bottom tabs */
const menuItems = [
  { href: '/properties', label: 'Properties', icon: Building2 },
  { href: '/owners', label: 'Owners', icon: Users },
  { href: '/tasks', label: 'Tasks', icon: ClipboardList },
  { href: '/contractors', label: 'Contractors', icon: HardHat },
  { href: '/reports', label: 'Owner Reports', icon: Sparkles },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/vault', label: 'Vault', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
]

function useUnreadMessages() {
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let mounted = true
    async function check() {
      try {
        const res = await fetch('/api/messages/unread')
        if (res.ok && mounted) {
          const data = await res.json()
          setUnread(data.unread || 0)
        }
      } catch {}
    }
    check()
    const interval = setInterval(check, 30_000) // poll every 30s
    return () => { mounted = false; clearInterval(interval) }
  }, [])
  return unread
}

export function LedgerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const unreadMessages = useUnreadMessages()

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top header — compact, financial feel */}
      <header className="sticky top-0 z-40 grid h-12 grid-cols-3 items-center border-b bg-card px-4">
        <div className="flex items-center">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger className="relative flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted -ml-2" aria-label="Open navigation menu">
              <Menu className="h-5 w-5" />
              {unreadMessages > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-status-danger" />
              )}
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex h-12 items-center gap-2.5 border-b px-4">
                <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" className="h-7 w-auto" />
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
                      {item.href === '/messages' && unreadMessages > 0 && (
                        <span className="ml-auto rounded-full bg-status-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {unreadMessages}
                        </span>
                      )}
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
        </div>
        <div className="flex justify-center">
          <img src="https://l.icdbcdn.com/oh/74d2487f-0550-4566-92d4-6cace7f7964a.png?w=400" alt="Marcus Properties" className="h-7 w-auto" />
        </div>
        <div className="flex justify-end">
          <span className="text-sm font-bold tracking-tight text-primary">ApartmentOS</span>
        </div>
      </header>

      {/* Main content — scrollable */}
      <main className="flex-1 overflow-auto pb-20">
        <div key={pathname} className="mx-auto max-w-2xl animate-fade-in px-4 py-4 lg:max-w-5xl lg:py-6">
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
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
                )}
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
