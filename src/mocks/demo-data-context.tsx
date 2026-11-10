import { createContext, useContext, type ReactNode } from 'react'

export type DemoData = typeof import('./data')

export const DemoDataContext = createContext<DemoData | null>(null)

export function useDemoData() {
  return useContext(DemoDataContext)
}

export function DemoDataProvider({
  value,
  children,
}: {
  value: DemoData | null
  children: ReactNode
}) {
  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>
}
