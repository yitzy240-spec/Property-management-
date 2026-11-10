'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ChecklistItem {
  id: string
  label: string
  is_completed: boolean
  ai_generated?: boolean
}

interface TaskChecklistProps {
  items: ChecklistItem[]
  taskId: string
}

export function TaskChecklist({ items, taskId }: TaskChecklistProps) {
  const router = useRouter()
  const [optimisticItems, setOptimisticItems] = useState(items)
  const [loading, setLoading] = useState<Set<string>>(new Set())

  useEffect(() => {
    setOptimisticItems(items)
  }, [items])

  useEffect(() => {
    router.refresh()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        router.refresh()
      }
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        router.refresh()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [router])

  const handleToggle = async (itemId: string) => {
    const item = optimisticItems.find(i => i.id === itemId)
    if (!item) return

    const newCompletedState = !item.is_completed

    setLoading(prev => new Set(prev).add(itemId))
    setOptimisticItems(prev => prev.map(i => 
      i.id === itemId ? { ...i, is_completed: newCompletedState } : i
    ))

    try {
      const res = await fetch('/api/tasks/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, isCompleted: newCompletedState }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update checklist')
      }

      router.refresh()
    } catch (error) {
      console.error('Failed to toggle checklist item:', error)
      setOptimisticItems(prev => prev.map(i => 
        i.id === itemId ? { ...i, is_completed: item.is_completed } : i
      ))
      alert(error instanceof Error ? error.message : 'Failed to update checklist item')
    } finally {
      setLoading(prev => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const completedCount = optimisticItems.filter(i => i.is_completed).length

  return (
    <section>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Checklist ({completedCount}/{optimisticItems.length})
      </p>
      <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
        {optimisticItems.map((item, i) => (
          <button
            key={item.id}
            onClick={() => handleToggle(item.id)}
            disabled={loading.has(item.id)}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted active:bg-muted/80 disabled:opacity-50 ${
              i > 0 ? 'border-t border-border' : ''
            }`}
          >
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                item.is_completed
                  ? 'border-status-safe bg-status-safe text-white'
                  : 'border-muted-foreground/30 hover:border-muted-foreground/50'
              }`}
            >
              {item.is_completed && <span className="text-xs">✓</span>}
            </div>
            <span className={`text-sm ${item.is_completed ? 'text-muted-foreground line-through' : ''}`}>
              {item.label}
            </span>
            {item.ai_generated && (
              <span className="text-xs text-muted-foreground/50">AI</span>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
