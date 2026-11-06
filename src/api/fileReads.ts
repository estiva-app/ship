import { fieldsOptedIn, relayFileReadsOf, type RelayFileReads } from '@estiva-app/protocol'

/*
  Ship's switch for projects (ALO-5, SPEC §6.13) is protocol's `projectFieldsOf`,
  the one rule Ship, Leaf and Peek switch by (ALO-6): on when the relay announces
  it keeps projects in order, or this tab opted in with `?fields=on` on the QA
  Folders the relay already fences, and only where the relay offers the list
  read and the opened file's text with it.

  why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-file-is-its-fields-each-kept-in-order-by-the-relay.md
*/

const OPT_IN_KEY = 'ship.projectFields'

/**
 * This tab's opt-in, taken from `?fields=on|off` when the page opens and kept
 * for the tab only: nothing narrows it to the QA Folders, so a link carrying it
 * must not switch a browser for good.
 */
export function optedIn(): boolean {
  try {
    return fieldsOptedIn(window.location.search, sessionStorage, OPT_IN_KEY)
  } catch {
    return false
  }
}

const NONE: RelayFileReads = { list: false, text: false, switched: false, inOrder: [], search: [] }

/** The relay's NIP-11, read once per page: a relay makes the switch once, and a reload reads it again. */
export function readFileReads(info: () => Promise<unknown>): Promise<RelayFileReads> {
  return info().then(relayFileReadsOf, () => NONE)
}
