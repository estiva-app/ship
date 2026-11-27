import { fileLinkWordsOf, filePathOf, KIND_BARE_FILE, type FileLinkWords, type LinkManifest } from '@estiva-app/interop'
import { isFileId } from '@estiva-app/protocol'
import { KIND } from '../nostr/kinds'

/**
 * A file's link, as Ship writes it (LIN-4): always through the shared writer,
 * interop's `filePathOf` / `fileUrlOf`, the code Peek, Leaf and the agent write
 * with. A `d` that is not a random lowercase uuid gets no link at all, since
 * the relay refuses any such file (LIN-1): Ship no longer writes a link it
 * cannot read back.
 *
 * Two sets of words, for two questions:
 *
 * - **Ship's own pages** ({@link SHIP_PAGE_WORDS}): the path a project, an
 *   issue or a topic opens at *here*, which `parse` reads back. Ship's router
 *   is Ship's, so these are its own words, not the manifests'.
 * - **The link handed out** ({@link linkWordsOf}): the kind's owner's word, read
 *   off the manifests (§7.7 rule 1), as every app writes it. Until they are read
 *   a link is the file's `/o/<naddr>`, which Ship opens like every app does.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-files-path-is-the-same-on-every-apps-host.md
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-files-id-is-a-random-uuid-the-same-rule-as-a-teams-id.md
 */

/** The word each file kind Ship has a page for opens at here: what `parse` reads back. */
export const SHIP_PAGE_WORDS: FileLinkWords = {
  byKind: { [KIND.PROJECT]: 'project', [KIND.ISSUE]: 'issue', [KIND_BARE_FILE]: 'topic' },
}

/**
 * The root paths that are Ship's own pages and not a file's word: the
 * listings, a team's pages (`/app/…`, and the older `/folder/…`), the `naddr`
 * form, and `assets`, which the server answers from disk and never hands to
 * the app (`deploy/nginx.conf`), so a link there is a 404.
 */
export const SHIP_ROOT_PATHS: readonly string[] = ['app', 'o', 'projects', 'issues', 'topics', 'folder', 'assets']

/** `<kind>:<pubkey>:<d>`, the `d` whole: it is any text on the wire, colons included; a pubkey holds none. */
const ADDRESS = /^(\d+):([^:]*):([^]*)$/

/** An address taken apart, or null when it is not one. Splitting on every `:` cut a `d` that holds one. */
export function addressParts(address: string): { kind: number; pubkey: string; d: string } | null {
  const match = ADDRESS.exec(address)
  return match ? { kind: Number(match[1]), pubkey: match[2], d: match[3] } : null
}

/** An address's `d`, whole, or `''` when it is not an address. */
export function dOf(address: string): string {
  return addressParts(address)?.d ?? ''
}

/**
 * An address's `d` when it is an id a file can have, or null. Reading the
 * uuid off the address's tail instead took `…:note-<uuid>` as that uuid's file.
 */
export function fileIdOfAddress(address: string): string | null {
  const d = dOf(address)
  return isFileId(d) ? d : null
}

/**
 * The words-free address the page path is built from: the writer needs an
 * address, and with a word for the kind the pubkey is never read.
 */
const NO_KEY = '0'.repeat(64)

/**
 * The path a project, an issue or a topic opens at in Ship, `/<word>/<slug>-<d>`,
 * or null for a `d` no file can have.
 */
export function pagePathOf(kind: number, d: string, title?: string): string | null {
  return filePathOf(`${kind}:${NO_KEY}:${d}`, SHIP_PAGE_WORDS, title)
}

/**
 * The words a link is handed out with: the shared writer's, minus a word that
 * is one of Ship's own pages. Any member can publish a newer manifest, and one
 * naming `/projects/<slug>-<d>`, or `/project/…` for an issue, would send every
 * such link Ship hands out to a page that opens something else; the kind falls
 * back to its `/o/<naddr>`, which opens the file (Peek drops its own the same
 * way, LIN-3 security review).
 */
export function linkWordsOf(manifests: readonly LinkManifest[]): FileLinkWords {
  const pageKinds = new Map(Object.entries(SHIP_PAGE_WORDS.byKind).map(([kind, word]) => [word, Number(kind)]))
  const byKind = Object.fromEntries(
    Object.entries(fileLinkWordsOf(manifests).byKind).filter(([kind, word]) => {
      const lower = word.toLowerCase()
      if (SHIP_ROOT_PATHS.includes(lower)) return false
      const page = pageKinds.get(lower)
      return page === undefined || page === Number(kind)
    }),
  )
  return { byKind }
}
