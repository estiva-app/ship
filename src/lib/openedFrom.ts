import { useSyncExternalStore } from 'react'

/**
 * Where the open project or issue was clicked in the sidebar: under one of your initiatives, or not, as Peek's
 * `rememberOpenedFrom` (TOP-4). Its row is lit in that one place (Katerina, 23 November: "you have 2 selections in the
 * sidebar"); opened any other way, its team's place is lit, as before. It holds for that page only: the next page
 * forgets it, and a reload lights the team's.
 */
export interface OpenedFromInitiative {
  /** The initiative whose fold holds the clicked row, by address. */
  topic: string
  /** The project or issue, by address. */
  file: string
}

let last: OpenedFromInitiative | undefined
const listeners = new Set<() => void>()
const tell = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** A row under an initiative was clicked: its page lights it there, and only there. */
export function rememberOpenedFromInitiative(topic: string, file: string): void {
  last = { topic, file }
  tell()
}

/** Another page is open, or none: the click is spent, unless it was for this one. */
export function forgetOpenedFromInitiative(unless?: string): void {
  if (!last || last.file === unless) return
  last = undefined
  tell()
}

/** The last click under an initiative, while its page is the one open. */
export function useOpenedFromInitiative(): OpenedFromInitiative | undefined {
  return useSyncExternalStore(subscribe, () => last, () => undefined)
}
