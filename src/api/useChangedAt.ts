import { useEffect, useState } from 'react'
import { MEMBER_FIELD_PREFIX } from '@estiva-app/conversation'
import { MAX_FILTERS_PER_QUERY } from '@estiva-app/protocol'
import { KIND } from '../nostr/kinds'
import { signedIn } from '../auth/estivaId'
import { timesOption } from './store'

/** `#d` values per times filter, as the shared readers ask (interop's `VALUES_PER_FILTER`). */
const PER_FILTER = 100

/**
 * When each of `issues` last changed, in seconds, where issues are read by
 * their fields (ISS-4, `on`): the load holds each field's current change but
 * no text, so a text save would not move an issue up a table's Updated. Read
 * from the relay's times read (SPEC §6.13), which answers each field's last
 * change time and no change: a few hundred bytes an issue, however often it was
 * edited. Who follows an issue is not an update to it (SHI-31). Read for the
 * issues a screen draws, and again when they change; empty while off, until
 * the read lands, or where the relay offers no times read.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-relay-may-answer-when-a-file-changed-without-the-change.md
 */
export function useChangedAt(issues: readonly string[], on: boolean): Readonly<Record<string, number>> {
  const key = on ? [...new Set(issues)].sort().join(' ') : ''
  const [read, setRead] = useState<{ key: string; at: Record<string, number> }>()
  useEffect(() => {
    if (!key || !signedIn()) return
    let live = true
    void (async () => {
      const { times } = await timesOption()
      if (!times) return
      const ds = key.split(' ').map((addr) => addr.split(':').slice(2).join(':'))
      const filters: Record<string, unknown>[] = []
      for (let at = 0; at < ds.length; at += PER_FILTER) filters.push({ fields: 'times', kinds: [KIND.ISSUE], '#d': ds.slice(at, at + PER_FILTER) })
      // The relay takes at most MAX_FILTERS_PER_QUERY filters a request: a project of over 1000 issues asks in several.
      const parts: Promise<Awaited<ReturnType<typeof times>>>[] = []
      for (let at = 0; at < filters.length; at += MAX_FILTERS_PER_QUERY) parts.push(times(filters.slice(at, at + MAX_FILTERS_PER_QUERY)))
      const answer = (await Promise.all(parts)).flat()
      const at: Record<string, number> = {}
      for (const file of answer) {
        const touched = file.changes.filter((change) => change.fields.some((field) => !field.startsWith(MEMBER_FIELD_PREFIX)))
        if (touched.length) at[file.a] = Math.max(...touched.map((change) => change.created_at))
      }
      if (live) setRead({ key, at })
    })().catch((error: unknown) => console.warn('[updated] could not read when the issues changed', error))
    return () => {
      live = false
    }
  }, [key])
  return read && read.key === key ? read.at : NONE
}

const NONE: Readonly<Record<string, number>> = {}
