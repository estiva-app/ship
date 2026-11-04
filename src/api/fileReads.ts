import { relayFileReadsOf, type RelayFileReads } from '@estiva-app/protocol'
import type { ProjectFields } from '../nostr/store'

/**
 * Ship's switch for projects (ALO-5, SPEC §6.13): read them by the relay's
 * list read and write each change after the one it follows.
 *
 * On when the relay announces it keeps projects in order (NIP-11 `files`,
 * `requires_prev` naming `osnova.project`) — the one announced moment, ALO-8 —
 * or when this browser opted in to try it on the QA Folders the relay already
 * fences: open Ship once with `?fields=on`, and `?fields=off` to leave. Either
 * way only where the relay offers the list read and the opened file's text with
 * it: without that a project's page could not read what it edits. Off, Ship
 * reads and writes as before.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-file-is-its-fields-each-kept-in-order-by-the-relay.md
 */
export function projectFieldsOf(reads: RelayFileReads, optedIn: boolean): ProjectFields | undefined {
  const announced = reads.switched && reads.inOrder.includes(PROJECT_TYPE)
  if (!reads.list || !reads.text || !(announced || optedIn)) return undefined
  return { text: reads.text, ...(reads.search.includes(PROJECT_TYPE) ? { search: true as const } : {}) }
}

/** A project's type, as NIP-11 names it (TYPES.md). */
export const PROJECT_TYPE = 'osnova.project'

const OPT_IN_KEY = 'ship.projectFields'

/**
 * This tab's opt-in, taken from `?fields=on|off` when the page opens and kept
 * for the tab only: nothing narrows it to the QA Folders, so a link carrying it
 * must not switch a browser for good.
 */
export function optedIn(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get('fields')
    if (asked === 'on') sessionStorage.setItem(OPT_IN_KEY, 'on')
    if (asked === 'off') sessionStorage.removeItem(OPT_IN_KEY)
    return sessionStorage.getItem(OPT_IN_KEY) === 'on'
  } catch {
    return false
  }
}

const NONE: RelayFileReads = { list: false, text: false, switched: false, inOrder: [], search: [] }

/** The relay's NIP-11, read once per page: a relay makes the switch once, and a reload reads it again. */
export function readFileReads(info: () => Promise<unknown>): Promise<RelayFileReads> {
  return info().then(relayFileReadsOf, () => NONE)
}
