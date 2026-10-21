import type { LinkState, Linked, LinkedConversation, LinkedFromOptions, LinkedKind } from '@estiva-app/ui'
import { linkStateFrom, linkedFrom } from '@estiva-app/ui'
import type { ForeignObject, People } from '@estiva-app/interop'
import { decodeNpub, referenceToPointer, stripInlineFormatting } from '@estiva-app/protocol'
import { referenceLink } from './referenceLink'
import { safeLink } from './handoff'
import { thingKindOfUri } from './thingKind'

/*
  What a link stands for, as the kit's link widgets draw it, built by the kit's
  one builder from interop's projection (`linkedFrom`, ui 0.86; 5ebf2756), so
  Peek, Ship and Leaf draw one file as one card (why:
  https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-link-on-words-counts-toward-the-card.md).
  Ship adds what only it knows: where its own files open, and a message's words.
*/

/** What a referenced address is, by its kind, before anything has been read: Peek's words. */
const REFERENCE_TYPE_WORDS: Record<number, string> = { 30850: 'Project', 30851: 'Issue', 30840: 'Topic', 30842: 'Document' }

/** A reference's type word — what "not available" names it by when nothing more is known. */
export function referenceTypeWord(uri: string): string | undefined {
  if (/^nostr:naddr1/i.test(uri)) {
    try {
      return REFERENCE_TYPE_WORDS[referenceToPointer(uri).kind] ?? 'File'
    } catch {
      return 'File'
    }
  }
  if (/^nostr:(?:nevent1|note1)/i.test(uri)) return 'Message'
  return undefined
}

/** What a reference names, by its icon, before anything has been read. */
export function linkedKindOf(uri: string): LinkedKind {
  return thingKindOfUri(uri) ?? 'file'
}

const NOSTR_REFERENCE = /nostr:(?:npub1|nprofile1|nevent1|note1|naddr1)[a-z0-9]+/gi

/** A message's words for a one-line preview: marks stripped, a reference read as its chip would say it. */
function previewText(body: string, people: People | undefined): string {
  return stripInlineFormatting(body)
    .replace(NOSTR_REFERENCE, (uri) => {
      if (/^nostr:npub1/i.test(uri)) {
        try {
          const name = people?.[decodeNpub(uri)]?.displayName
          if (name) return `@${name}`
        } catch {
          // Not a key: read as the reference it is.
        }
        return `@${uri.slice('nostr:'.length, 'nostr:'.length + 12)}…`
      }
      return referenceTypeWord(uri) ?? uri
    })
    .trim()
}

export interface LinkedContext {
  /** The workspace's people, for the owner picker's options. */
  directory?: People
  /**
   * Changes the file from its card. Without it the values read as words
   * (Decided 16 Oct: any reader may change a file from its card; words only in
   * a preview and for a file that cannot be read).
   */
  onAct?: (actionId: string, value: string) => void
  /** What was said about it, when the caller has read that. */
  conversation?: LinkedConversation
}

/** Where a reference opens: Ship's own page for its own files, the owning app for anyone else's. */
export function hrefOf(object: ForeignObject): string {
  // Another app's address comes from a manifest anyone in the workspace may publish: https only (`safeLink`).
  return referenceLink(object)?.href ?? safeLink(object.openUrl) ?? ''
}

function optionsOf(context: LinkedContext = {}): LinkedFromOptions<ForeignObject> {
  return {
    // A row on the card is an interop child of the same object: the same rule finds where it opens.
    hrefOf: (object) => hrefOf(object),
    previewText,
    ...context,
  }
}

/** The file a reference names, read from interop's projection of it. */
export function linkedOf(object: ForeignObject, context?: LinkedContext): Linked {
  return linkedFrom(object, optionsOf(context))
}

/** "Not available.", named by what the reference says it is. */
export function notAvailable(uri: string): LinkState {
  return { state: 'unavailable', kind: linkedKindOf(uri), noun: referenceTypeWord(uri) ?? 'Link' }
}

/**
 * Where a reference's lookup stands, for the kit: `undefined` is still asked,
 * `null` an answer of nothing. Nothing, and a file the reader may not read,
 * draw alike: "not available." (Miky, 15 Oct).
 */
export function linkStateOf(uri: string, object: ForeignObject | null | undefined, context?: LinkedContext): LinkState {
  return linkStateFrom(object, { kind: linkedKindOf(uri), noun: referenceTypeWord(uri) ?? 'Link' }, optionsOf(context))
}
