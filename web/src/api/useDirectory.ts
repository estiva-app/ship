import { useCallback, useEffect, useRef, useState } from 'react'
import type { Directory, Profile } from '../../../src/profiles'
import { profiles } from './index'
import { short } from './people'

/** What a component needs to draw a person: a name and a face, never a key. */
export interface Person {
  name?: string
  picture?: string
}

export interface DirectoryView {
  /** Everything learnt so far. */
  directory: Directory
  /** Display name, or the shortened key while there is none. */
  nameOf: (pubkey: string) => string
  /** `{ name, picture }` for the UI — the shortened key as the name while there is no profile, as the old app shows one. */
  personOf: (pubkey: string) => Person
  profileOf: (pubkey: string) => Profile | undefined
}

/**
 * Who everyone is, from `kind:0`, on the old app's two-speed rule
 * (`learn` in apps/ship/app.ts):
 *
 * - When `navKey` changes — a navigation, an explicit reload — every key in
 *   `pubkeys` is re-read, so a rename made in Peek shows on the next screen.
 * - Otherwise (the poll handing in a new snapshot) only keys never seen
 *   are asked for, so sitting on an issue does not re-query the whole cast
 *   every tick for names that almost never change.
 *
 * Failure is swallowed: a missing name degrades to a shortened key, which is
 * where this app started, and is not worth a banner over a list that loaded.
 */
export function useDirectory(pubkeys: string[], navKey: string): DirectoryView {
  const [directory, setDirectory] = useState<Directory>(() => new Map())
  const known = useRef<Directory>(new Map())
  const lastNavKey = useRef<string | null>(null)
  const mounted = useRef(true)
  const wanted = pubkeys.join()

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const refresh = lastNavKey.current !== navKey
    lastNavKey.current = navKey
    const keys = wanted ? wanted.split(',') : []
    const ask = refresh ? keys : keys.filter((pubkey) => !known.current.has(pubkey))
    if (!ask.length) return
    let cancelled = false
    profiles(ask)
      .then((learnt) => {
        if (cancelled || !mounted.current) return
        const next = new Map(known.current)
        for (const [pubkey, profile] of learnt) next.set(pubkey, profile)
        known.current = next
        setDirectory(next)
      })
      .catch(() => {
        // Names are a nicety; the record is what matters and it already loaded.
      })
    return () => {
      cancelled = true
    }
  }, [wanted, navKey])

  const profileOf = useCallback((pubkey: string) => directory.get(pubkey), [directory])
  const nameOf = useCallback((pubkey: string) => directory.get(pubkey)?.name ?? short(pubkey), [directory])
  const personOf = useCallback(
    (pubkey: string): Person => {
      const profile = directory.get(pubkey)
      return { name: profile?.name ?? short(pubkey), picture: profile?.picture }
    },
    [directory],
  )

  return { directory, nameOf, personOf, profileOf }
}
