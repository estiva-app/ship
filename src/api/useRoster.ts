import { useEffect, useState } from 'react'
import type { SignedEvent } from '@estiva-app/protocol'
import { relay } from './store'
import { KIND_MEMBERSHIP_LIST, rosterOf } from './people'

let asked: Promise<string[] | null> | undefined

/**
 * The workspace's members, read once per tab — what `@` offers (CON-25). One
 * `kind:13534` the relay signs, the read Peek makes for the same list.
 * `undefined` while it loads, `null` on a relay that keeps none or a read that
 * failed: the caller falls back to the people in the snapshot.
 */
export function useRoster(): string[] | null | undefined {
  const [roster, setRoster] = useState<string[] | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    asked ??= relay
      .query([{ kinds: [KIND_MEMBERSHIP_LIST], limit: 1 }] as never)
      .then((events) => rosterOf(events as SignedEvent[]))
      .catch(() => {
        asked = undefined // A refused read is asked again on the next mount.
        return null
      })
    void asked.then((found) => live && setRoster(found))
    return () => {
      live = false
    }
  }, [])
  return roster
}
