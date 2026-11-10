import type { SignedEvent } from '@estiva-app/protocol'
import { relay } from './store'

/** How long the list is trusted: a profile made meanwhile is read on the next page open after it. */
const HELD_MS = 60_000

let held: { at: number; keys: string[] } | undefined
let asking: Promise<string[] | undefined> | undefined

/**
 * Every key with an Estiva profile (`kind:0`, which only Estiva ID publishes,
 * one per account): who a file's members are read by. A membership change
 * names its person (SPEC §11.8, MUST since ALO-19), so the changes naming one
 * of these are the fold's whole input. One read shared by every page for a
 * minute, and one in flight at a time; `undefined` when the relay did not
 * answer, and the caller then reads every change.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-membership-change-names-the-person-it-is-about.md
 */
export function profileKeys(): Promise<string[] | undefined> {
  if (held && Date.now() - held.at < HELD_MS) return Promise.resolve(held.keys)
  asking ??= Promise.resolve()
    .then(() => relay.query([{ kinds: [0], limit: 500 }] as never))
    .then((events) => {
      const keys = [...new Set((events as SignedEvent[]).map((e) => e.pubkey))].sort()
      held = { at: Date.now(), keys }
      return keys
    })
    .catch(() => undefined)
    .finally(() => {
      asking = undefined
    })
  return asking
}

/** Test seam. */
export function resetProfileKeysForTests(): void {
  held = undefined
  asking = undefined
}
