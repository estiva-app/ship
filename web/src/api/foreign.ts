/**
 * Rendering another app's objects — Ship's half of PRO-7.
 *
 * **Ship has been a producer and nothing else.** It publishes a manifest saying
 * how its projects and issues should be drawn elsewhere, and has never drawn
 * anyone else's. Peek has been the only consumer since the layer was built, so
 * every line of the runtime has had exactly one caller and no second opinion —
 * which is the bill SHA-7 exists to pay, and PRO-1 deliberately left this
 * ticket in front of publishing the package.
 *
 * This file is the second opinion. It is deliberately thin: everything that
 * knows what a manifest *is* lives in the vendored runtime, and everything here
 * is Ship supplying its environment. If this file ever needs to know what Peek
 * is, the layer has failed and that belongs on PRO-7 rather than being worked
 * around here.
 */
import type { SignedEvent } from '@estiva-app/protocol'
import { resolveForeignObject, type ForeignObject } from '../../../interop/projection'
import { relay } from './store'

export type { ForeignObject, ResolvedSlot } from '../../../interop/projection'

/**
 * The one environment touch the runtime takes: a filter query.
 *
 * ADR 0002 §10 constraint 2 in practice — the runtime reaches for nothing and
 * is handed everything. Ship's relay is authenticated the same way the rest of
 * the app's reads are, so a reference to a Folder the viewer cannot see comes
 * back `unreachable` rather than throwing.
 */
const query = (filters: Record<string, unknown>[]): Promise<SignedEvent[]> =>
  relay.query(filters as never)

/**
 * Resolve a `nostr:naddr…` (or a bare `kind:pubkey:d`) to a foreign object.
 *
 * Returns null when the reference is malformed or no app claims the kind — both
 * of which mean "there is nothing to draw", as distinct from an object that
 * resolved and cannot be read, which comes back with `unreachable` set. Those
 * are different sentences to a reader and the widget says so.
 */
export function resolveForeign(reference: string): Promise<ForeignObject | null> {
  return resolveForeignObject(reference, query)
}
