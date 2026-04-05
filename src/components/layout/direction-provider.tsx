'use client'

import { createContext, useContext, useEffect } from 'react'

export type Direction = 'command-center' | 'ledger' | 'property-first' | 'shift-planner'

const DirectionContext = createContext<Direction>('ledger')

export function useDirection() {
  return useContext(DirectionContext)
}

export function DirectionProvider({
  direction = 'ledger',
  children,
}: {
  direction?: Direction
  children: React.ReactNode
}) {
  // Set data-direction in useEffect to avoid hydration mismatch
  useEffect(() => {
    document.documentElement.setAttribute('data-direction', direction)

    if (direction === 'shift-planner') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [direction])

  return (
    <DirectionContext.Provider value={direction}>
      {children}
    </DirectionContext.Provider>
  )
}
