'use client'

import { useState } from 'react'
import { Link2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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

interface MagicLinkGeneratorProps {
  propertyId: string
  propertyName: string
}

export function MagicLinkGenerator({ propertyId, propertyName }: MagicLinkGeneratorProps) {
  const [generating, setGenerating] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function generate(linkType: 'contractor' | 'guest') {
    setGenerating(true)
    setGeneratedUrl(null)

    try {
      const res = await fetch('/api/magic-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          link_type: linkType,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to generate')
      }

      const { url } = await res.json()
      setGeneratedUrl(url)
      toast.success(`${linkType === 'guest' ? 'Guest' : 'Contractor'} link generated`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate link')
    } finally {
      setGenerating(false)
    }
  }

  async function copyToClipboard() {
    if (!generatedUrl) return
    await navigator.clipboard.writeText(generatedUrl)
    setCopied(true)
    toast.success('Link copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Drawer onOpenChange={() => { setGeneratedUrl(null); setCopied(false) }}>
      <DrawerTrigger asChild>
        <Button className="w-full rounded-[var(--radius-button)] sm:w-auto" size="sm">
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
          Generate Magic Link
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Generate Magic Link</DrawerTitle>
          <DrawerDescription>
            Create a secure link for {propertyName}. Expires in 72 hours.
          </DrawerDescription>
        </DrawerHeader>

        <div className="p-4">
          {!generatedUrl ? (
            <div className="space-y-3">
              <button
                onClick={() => generate('contractor')}
                disabled={generating}
                className="flex w-full items-center justify-between rounded-[10px] border border-border p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-semibold">Contractor Link</p>
                  <p className="text-xs text-muted-foreground">Task checklist, photo upload, entry code</p>
                </div>
              </button>
              <button
                onClick={() => generate('guest')}
                disabled={generating}
                className="flex w-full items-center justify-between rounded-[10px] border border-border p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-semibold">Guest Check-in Link</p>
                  <p className="text-xs text-muted-foreground">Entry code (time-gated), video guide, stay info</p>
                </div>
              </button>
              {generating && (
                <p className="text-center text-xs text-muted-foreground">Generating...</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted p-3">
                <p className="break-all font-mono text-xs text-foreground">{generatedUrl}</p>
              </div>
              <Button onClick={copyToClipboard} className="w-full gap-1.5">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
            </div>
          )}
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
