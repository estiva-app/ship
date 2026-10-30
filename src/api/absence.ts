import { useEffect, useSyncExternalStore } from 'react'
import { pointerToAddress, readAbsence, referenceToPointer, type SignedEvent } from '@estiva-app/protocol'
import { relay } from './store'

/**
 * Whether a file a link names was deleted, or is only not this reader's to see
 * (SPEC §13.6.1, "Five states, and deleted is not not-permitted"; Katerina,
 * 30 Oct, widget review 56): both read back empty, and a trusted deletion
 * naming the address is the one thing that tells them apart — the protocol's
 * read (`readAbsence`), the same in every app.
 *
 * Asked once per address in a tab, only for a file whose read came back empty,
 * never for a read that failed: a deletion is not undone, and "not available"
 * stays until the answer says otherwise.
 */
const answers = new Map<string, 'deleted' | 'unreadable'>()
const asking = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

const query = (filters: Record<string, unknown>[]): Promise<SignedEvent[]> => relay.query(filters as never)

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The address a `nostr:naddr` reference names; nothing for a message or a person, which no deletion names by `a`. */
function addressOf(reference: string): string | undefined {
  if (!/^nostr:naddr1/i.test(reference)) return undefined
  try {
    return pointerToAddress(referenceToPointer(reference))
  } catch {
    return undefined
  }
}

function ask(address: string): void {
  if (answers.has(address) || asking.has(address)) return
  asking.add(address)
  readAbsence(address, query)
    .then((answer) => answers.set(address, answer))
    // A failed read answers neither: asked again the next time the link draws empty.
    .catch(() => {})
    .finally(() => {
      asking.delete(address)
      version++
      listeners.forEach((listener) => listener())
    })
}

/** True once a trusted deletion is known to name the file `reference` points at, whose read came back empty (`absent`). */
export function useDeleted(reference: string, absent: boolean): boolean {
  const address = absent ? addressOf(reference) : undefined
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (address) ask(address)
  }, [address])
  return !!address && answers.get(address) === 'deleted'
}

/** Test seam. */
export function resetAbsenceForTests(): void {
  answers.clear()
  asking.clear()
}
