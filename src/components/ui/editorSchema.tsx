import { createContext, useContext } from 'react'
import type { Imeta } from '@estiva-app/protocol'
import {
  AttachmentNode as SharedAttachmentNode,
  ReferenceNode as SharedReferenceNode,
  type AttachmentViewProps,
  type ReferenceViewProps,
} from '@estiva-app/ui/editor'
import type { ForeignObject } from '@/api/foreign'
import { Attachment } from './Attachment'
import { Reference } from './Reference'

/**
 * What only Ship adds to the block editor's nodes — RIC-14, and the attachment
 * since SHI-2.
 *
 * The nodes themselves moved to `@estiva-app/ui/editor` (MAN-9), and the
 * document ⇄ editor translation beside them to `@estiva-app/protocol`, when
 * Peek became the second editor of the same descriptions: two copies of the
 * schema would be two opinions on which ids survive a save. What stays is how
 * Ship draws a reference and a file inside the editor — the same `Reference`
 * and `Attachment` the reading surface uses — and the context the reference
 * reads them from. Callers import from here as before.
 */

/** What a reference needs to draw itself, from the description around it. */
export interface ReferenceContextValue {
  resolved: Record<string, ForeignObject | null | undefined>
  nameOf?: (pubkey: string) => string
}

const ReferenceContext = createContext<ReferenceContextValue>({ resolved: {} })
export const ReferenceProvider = ReferenceContext.Provider

export { BlockId, UnknownBlock } from '@estiva-app/ui/editor'

/**
 * A reference drawn through the same {@link Reference} the reading surface
 * uses, so a project keeps its name and its status while a person is typing
 * beside it — the alternative is bech32 in the middle of a sentence the moment
 * you click.
 */
function ReferenceView({ uri }: ReferenceViewProps) {
  const { resolved, nameOf } = useContext(ReferenceContext)
  return <Reference uri={uri} object={resolved[uri]} nameOf={nameOf} />
}

// Drawn, never opened: the description saves on blur, and a link or a Download button would take focus.
function AttachmentView({ attrs }: AttachmentViewProps) {
  return <Attachment file={attrs as unknown as Imeta} opens={false} />
}

export const ReferenceNode = SharedReferenceNode.configure({ view: ReferenceView })
export const AttachmentNode = SharedAttachmentNode.configure({ view: AttachmentView })
