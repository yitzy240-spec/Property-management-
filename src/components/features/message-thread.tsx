'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  sender_role: 'admin' | 'owner'
  body: string
  is_read: boolean
  created_at: string
}

interface MessageThreadProps {
  propertyId: string
  propertyName: string
  currentRole: 'admin' | 'owner'
}

export function MessageThread({ propertyId, propertyName, currentRole }: MessageThreadProps) {
  const supabase = useMemo(() => createClient(), [])
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [drafting, setDrafting] = useState(false)

  async function handleDraftReply() {
    setDrafting(true)
    try {
      const res = await fetch('/api/ai/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      })
      if (!res.ok) {
        toast.error('AI draft unavailable')
      } else {
        const { draft } = await res.json()
        if (draft) {
          setNewMessage(draft)
          toast.success('AI draft generated')
        } else {
          toast.error('AI returned empty draft')
        }
      }
    } catch {
      toast.error('AI draft unavailable')
    }
    setDrafting(false)
  }
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadMessages() {
      try {
        const res = await fetch('/api/messages?property_id=' + propertyId)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages || [])
        }
      } catch {
        // silent fail
      }
    }

    loadMessages()
  }, [propertyId, currentRole])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!newMessage.trim()) return
    setSending(true)

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          sender_role: currentRole,
          body: newMessage.trim(),
        }),
      })

      const data = await res.json()
      if (res.ok && data.message) {
        setMessages(prev => [...prev, data.message as Message])
        setNewMessage('')
      } else {
        toast.error('Failed to send message')
      }
    } catch {
      toast.error('Network error — message not sent')
    }

    setSending(false)
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-IL', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jerusalem',
    })
  }

  function formatDateLabel(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    const msgDate = d.toLocaleDateString('en-IL', { timeZone: 'Asia/Jerusalem' })
    const todayDate = now.toLocaleDateString('en-IL', { timeZone: 'Asia/Jerusalem' })
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayDate = yesterday.toLocaleDateString('en-IL', { timeZone: 'Asia/Jerusalem' })

    if (msgDate === todayDate) return 'Today'
    if (msgDate === yesterdayDate) return 'Yesterday'
    return d.toLocaleDateString('en-IL', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Jerusalem' })
  }

  function getDateKey(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-IL', { timeZone: 'Asia/Jerusalem' })
  }

  return (
    <div className="flex h-[400px] flex-col rounded-lg border">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">{propertyName}</p>
        <p className="text-xs text-muted-foreground">
          {messages.length} messages
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No messages yet. Start a conversation.
          </p>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_role === currentRole
            const prevMsg = idx > 0 ? messages[idx - 1] : null
            const showDateSeparator = !prevMsg || getDateKey(msg.created_at) !== getDateKey(prevMsg.created_at)

            return (
              <div key={msg.id}>
                {showDateSeparator && (
                  <div className="flex items-center justify-center py-2">
                    <span className="rounded-full bg-muted px-3 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {formatDateLabel(msg.created_at)}
                    </span>
                  </div>
                )}
                <div className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[75%] rounded-lg px-3 py-2',
                      isMe
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    <p className="text-sm">{msg.body}</p>
                    <p
                      className={cn(
                        'mt-1 text-[10px]',
                        isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      )}
                    >
                      {msg.sender_role === 'admin' ? 'Manager' : 'Owner'} · {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          className="flex gap-2"
        >
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            disabled={sending}
          />
          {currentRole === 'admin' && (
            <Button type="button" size="icon" variant="outline" onClick={handleDraftReply} disabled={drafting} title="AI draft reply" aria-label="Draft AI reply">
              <Sparkles className={`h-4 w-4 ${drafting ? 'animate-pulse text-accent' : ''}`} />
            </Button>
          )}
          <Button type="submit" size="icon" disabled={sending || !newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
