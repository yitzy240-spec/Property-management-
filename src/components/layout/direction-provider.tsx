'use client'

import { createContext, useContext } from 'react'

export type Direction = 'command-center' | 'ledger' | 'property-first' | 'shift-planner'

const DirectionContext = createContext<Direction>('ledger')

export function useDirection() {
  return useContext(DirectionContext)
}

/**
 * DirectionProvider sets the active design direction on the document root.
 * This drives all CSS token overrides via [data-direction="..."] selectors.
 *
 * Usage: wrap the app in <DirectionProvider direction="ledger">
 * The direction can come from: env var, admin setting, or Zustand store.
 *
 * For now, defaults to 'ledger' — will be set by client choice.
 */
export function DirectionProvider({
  direction = 'ledger',
  children,
}: {
  direction?: Direction
  children: React.ReactNode
}) {
  // Set data-direction on <html> for CSS token selectors
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-direction', direction)

    // Shift Planner defaults to dark mode
    if (direction === 'shift-planner') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  return (
    <DirectionContext.Provider value={direction}>
      {children}
    </DirectionContext.Provider>
  )
}
