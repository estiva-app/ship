import { relayFileReadsOf, type RelayFileReads } from '@estiva-app/protocol'

/*
  How Ship reads and writes files: one way (SPEC §6.13, ALL-8). Every relay
  keeps every file type in order and answers the list, open and times reads, so
  nothing here switches: the relay's NIP-11 says only which types it finds by
  the words of their current fields (`file_search.types`).

  why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/the-old-way-goes-once-miky-has-looked.md
*/

const NONE: RelayFileReads = { search: [] }

/** The relay's NIP-11, read once per page; nothing searched when it cannot be read. */
export function readFileReads(info: () => Promise<unknown>): Promise<RelayFileReads> {
  return info().then(relayFileReadsOf, () => NONE)
}
