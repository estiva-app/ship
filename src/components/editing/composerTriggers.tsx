import { IconMessage } from '@tabler/icons-react'
import { mentionText } from '@estiva-app/conversation'
import { CaptionedReference, PersonMention, ReferenceTrigger, UrgentPersonMention, type CaptionedItem, type MentionPerson } from '@estiva-app/ui/editor'

/**
 * `@`, `!@` and `[` in Ship's message box — CON-25. The triggers, the lists and
 * the chips are `@estiva-app/ui/editor`'s (CON-27), and what a pick writes is
 * `@estiva-app/conversation`'s. What they offer is `mentionables.tsx`; what
 * stays here is turning the chips into the references the block bridge writes
 * as marker text.
 */

const REFERENCE_ICON = <IconMessage size={16} stroke={1.5} className="text-text-secondary" />

/** The extensions, reading the latest people and messages each time a list opens. */
export function composerTriggers(read: { people: () => readonly MentionPerson[]; references: () => readonly CaptionedItem[] }) {
  return [
    PersonMention.configure({ people: read.people }),
    UrgentPersonMention.configure({ people: read.people }),
    CaptionedReference.configure({ icon: REFERENCE_ICON }),
    ReferenceTrigger.configure({ items: read.references, nodeName: 'captionedReference', ariaLabel: 'Messages', sectionLabel: 'Messages', icon: REFERENCE_ICON }),
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
