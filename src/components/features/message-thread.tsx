'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Send } from 'lucide-react'
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
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadMessages() {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: true })

      if (data) setMessages(data as Message[])

      // Mark unread messages as read
      if (data && data.length > 0) {
        const unread = data.filter(m => !m.is_read && m.sender_role !== currentRole)
        if (unread.length > 0) {
          await supabase
            .from('messages')
            .update({ is_read: true })
            .in('id', unread.map(m => m.id))
        }
      }
    }

    loadMessages()
  }, [propertyId, currentRole, supabase])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!newMessage.trim()) return
    setSending(true)

    const { data, error } = await supabase
      .from('messages')
      .insert({
        property_id: propertyId,
        sender_role: currentRole,
        body: newMessage.trim(),
      })
      .select()
      .single()

    if (!error && data) {
      setMessages(prev => [...prev, data as Message])
      setNewMessage('')
    }

    setSending(false)
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))

    const time = d.toLocaleTimeString('en-IL', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jerusalem',
    })

    if (diffDays === 0) return time
    if (diffDays === 1) return `Yesterday ${time}`
    return `${d.toLocaleDateString('en-IL', { day: 'numeric', month: 'short', timeZone: 'Asia/Jerusalem' })} ${time}`
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
          messages.map((msg) => {
            const isMe = msg.sender_role === currentRole
            return (
              <div
                key={msg.id}
                className={cn('flex', isMe ? 'justify-end' : 'justify-start')}
              >
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
          <Button type="submit" size="icon" disabled={sending || !newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
