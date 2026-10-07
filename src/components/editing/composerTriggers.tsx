import { IconMessage } from '@tabler/icons-react'
import { mentionText } from '@estiva-app/conversation'
import { decodeNpub } from '@estiva-app/protocol'
import { CaptionedReference, PersonMention, ReferenceTrigger, UrgentPersonMention, type MentionPerson } from '@estiva-app/ui/editor'
import { REFERENCE_COPY, type ReferenceSection } from '@/api/references'

/**
 * `@`, `!@` and `[` in Ship's message box — CON-25. The triggers, the lists and
 * the chips are `@estiva-app/ui/editor`'s (CON-27), and what a pick writes is
 * `@estiva-app/conversation`'s. What they offer is `mentionables.tsx`; what
 * stays here is turning the chips into the references the block bridge writes
 * as marker text.
 */

const REFERENCE_ICON = <IconMessage size={16} stroke={1.5} className="text-text-secondary" />

/**
 * The extensions, reading the latest people and `[` sections each time a list
 * opens: Messages then Files (PEE-21), drawn again when a search answer lands.
 */
export function composerTriggers(read: {
  people: () => readonly MentionPerson[]
  references: (query: string) => readonly ReferenceSection[]
  subscribe?: (listener: () => void) => () => void
  /**
   * Whether `!@` offers an urgent pick. `false` in a box that edits a sent
   * message: an edit carries no tags, so a new pick could never be sent. The
   * chip itself stays, so the message's own urgent mentions load urgent
   * (Miky, CON-24 kickoff, 2026-10-07).
   */
  urgent?: boolean
}) {
  return [
    PersonMention.configure({ people: read.people }),
    UrgentPersonMention.configure({ people: read.people, ...(read.urgent === false ? { suggestion: { allow: () => false } } : {}) }),
    CaptionedReference.configure({ icon: REFERENCE_ICON }),
    ReferenceTrigger.configure({
      items: () => [],
      sections: read.references,
      subscribe: read.subscribe,
      nodeName: 'captionedReference',
      ariaLabel: REFERENCE_COPY.ariaLabel,
      sectionLabel: REFERENCE_COPY.messages,
      icon: REFERENCE_ICON,
    }),
  ]
}

type EditorNode = { type: string; attrs?: Record<string, unknown>; text?: string; content?: EditorNode[] }

/**
 * The chips as the block bridge can write them. `fromEditorDocument` knows a
 * `reference` and drops any inline node it does not, so a picked person would
 * vanish from the message: a chip becomes the `reference` its `nostr:` text
 * names (§13.1), or `@Name` / `!@Name` for somebody with no key.
 */
export function chipsAsReferences(node: EditorNode): EditorNode {
  const text = (value: string): EditorNode => ({ type: 'text', text: value })
  const reference = (uri: string): EditorNode => ({ type: 'reference', attrs: { uri } })
  if (node.type === 'mention' || node.type === 'urgentMention') {
    const pubkey = typeof node.attrs?.pubkey === 'string' ? node.attrs.pubkey : null
    const written = mentionText({ pubkey, label: String(node.attrs?.label ?? '') }, node.type === 'urgentMention')
    return pubkey ? reference(written) : text(written)
  }
  if (node.type === 'captionedReference') {
    const uri = typeof node.attrs?.uri === 'string' ? node.attrs.uri : ''
    return uri ? reference(uri) : text(String(node.attrs?.label ?? ''))
  }
  return node.content ? { ...node, content: node.content.map(chipsAsReferences) } : node
}

/**
 * An edit's text with any `!@Name` the message did not already hold written as
 * an ordinary `@Name` — CON-24. An edit carries no tags, so it makes nobody
 * urgent (Miky, kickoff, 2026-10-07); a hand-typed `!@Name` is the old urgent
 * text, which Peek still draws urgent while it pages nobody.
 */
export function withoutNewUrgency(text: string, original: string): string {
  return text.replace(/!@([^\s!@]+)/g, (whole, name: string) => (original.includes(whole) ? whole : `@${name}`))
}

/**
 * The other way, for the people a draft named urgently — CON-31. Marker text
 * gives back a person as the `reference` its `nostr:npub…` names, urgent or
 * not (§13.1 puts the urgency in a tag); a draft keeps whom it named urgently
 * beside the text, and those references become urgent chips again.
 */
export function urgentChipsFrom(node: EditorNode, urgent: readonly string[] | undefined, label: (pubkey: string) => string): EditorNode {
  if (!urgent || urgent.length === 0) return node
  const keys = new Set(urgent)
  const walk = (n: EditorNode): EditorNode => {
    const uri = n.type === 'reference' && typeof n.attrs?.uri === 'string' ? n.attrs.uri : ''
    if (/^nostr:npub1/i.test(uri)) {
      let pubkey: string | null = null
      try {
        pubkey = decodeNpub(uri)
      } catch {
        pubkey = null
      }
      if (pubkey && keys.has(pubkey)) return { type: 'urgentMention', attrs: { id: pubkey, label: label(pubkey), pubkey } }
    }
    return n.content ? { ...n, content: n.content.map(walk) } : n
  }
  return walk(node)
}
