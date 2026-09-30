import type { ReactNode } from 'react'
import { IconBox, IconListDetails } from '@tabler/icons-react'
import { standaloneReference, toRenderTree, type Imeta } from '@estiva-app/protocol'
import { WithTooltip } from '@estiva-app/ui'
import { ago } from '@/lib/time'
import type { DraftStore } from '@/lib/drafts'
import type { Reaction } from '@/api'
import type { ForeignObject as ForeignObjectData } from '@/api/foreign'
import { reactionName } from '@/components/Reactions'
import type { ConversationsProps } from '@/components/ConversationThread'
import type { ActivityProps, Relation } from '@/components/Activity'

/** Messages are marker text (SPEC §13.2); only a rich text *field* is a block document. */
export const MESSAGE_FORMAT = 'marker' as const

/**
 * The pointers standing alone on a line of a message: drawn below it as the
 * object they name, while a pointer inside a sentence stays where it was
 * written (RIC-10). The package's rule (`standaloneReference`), so Peek reaches
 * the same answer. Reading the tree only — `RichText` draws it.
 */
export function standaloneReferencesOf(body: string): string[] {
  return toRenderTree(body, MESSAGE_FORMAT)
    .map(standaloneReference)
    .filter((r): r is string => !!r)
}

/** The time as "3h ago", and the date and time on hover (Katerina, 29 September). */
export function Time({ at }: { at: number }) {
  return (
    <WithTooltip label={new Date(at * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}>
      <span className="whitespace-nowrap text-caption text-text-muted">{ago(at)}</span>
    </WithTooltip>
  )
}

/**
 * A reaction's tooltip in Peek's words: who, and what the reaction means —
 * "Ravi Mehta and Mara Sato reacted with Makes sense" (Katerina, 29 September:
 * the two apps say the same thing).
 */
export function meaningLabel(reaction: Reaction, nameOf?: (pubkey: string) => string): string {
  const names = reaction.by.map((pubkey) => nameOf?.(pubkey) ?? `${pubkey.slice(0, 8)}…`)
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${who} reacted with ${reactionName(reaction.emoji)}`
}

/**
 * How a conversation elsewhere is related, in words for a screen reader —
 * "Mentioned in" is SPEC §6.4's phrase. A mention stays quieter than a
 * sub-file's thread (CON-9); Ship itself only produces mentions (PEE-26).
 */
export const RELATION: Record<Relation, { label: string; muted: boolean }> = {
  mention: { label: 'Mentioned in', muted: true },
  'sub-file': { label: 'On an issue', muted: false },
}

/** The icon Ship's sidebar gives each kind of place (Katerina, 29 September). */
export const PLACE_ICON: Record<'project' | 'issue', ReactNode> = {
  project: <IconBox size={14} stroke={1.5} />,
  issue: <IconListDetails size={14} stroke={1.5} />,
}

/**
 * What the drawing of a page's conversations needs: the page's own props, and
 * the reads the surface makes once for all of them. Split from the reads so a
 * story can hand them in without a relay.
 */
export interface ThreadListViewProps extends ConversationsProps {
  resolved?: Record<string, ForeignObjectData | null | undefined>
  resolving?: boolean
  reactionsBy?: Record<string, readonly Reaction[]>
  /** Messages past the reactions horizon — CON-1. */
  omitted?: number
  /** The upload behind attach. Injected so a story needs no relay. */
  upload?: (file: File) => Promise<Imeta>
  /** Where unsent text is kept — CON-10. Injected so a test needs no browser. */
  drafts?: DraftStore
}

export interface MentionListViewProps extends ActivityProps {
  resolved?: Record<string, ForeignObjectData | null | undefined>
  resolving?: boolean
  reactionsBy?: Record<string, readonly Reaction[]>
  upload?: (file: File) => Promise<Imeta>
  drafts?: DraftStore
}
