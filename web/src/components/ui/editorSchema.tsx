import { createContext, useContext } from 'react'
import { Extension, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { inlineTextOf, type Block, type Imeta } from '@estiva-app/protocol'
import type { ForeignObject } from '@/api/foreign'
import { Attachment } from './Attachment'
import { Reference } from './Reference'

/**
 * The four things Ship's editor needs that a stock schema does not have —
 * RIC-14, and the attachment since SHI-2.
 *
 * Everything else a description can contain is already a ProseMirror node of
 * the same name, which is why `StarterKit` covers it and this file is short.
 * See `lib/blockEditor.ts` for why the two models line up at all.
 */

/** What a reference needs to draw itself, from the description around it. */
export interface ReferenceContextValue {
  resolved: Record<string, ForeignObject | null | undefined>
  nameOf?: (pubkey: string) => string
}

const ReferenceContext = createContext<ReferenceContextValue>({ resolved: {} })
export const ReferenceProvider = ReferenceContext.Provider

/**
 * `id` on every block, carried as an attribute.
 *
 * A global attribute rather than one per node type, because §13.3 puts an id
 * on **every** block and a type that quietly lacked one would mint a fresh id
 * on every save — detaching each anchored comment on it (RFC 0.4 §6) with
 * nothing on screen to say so.
 *
 * Rendered as `data-block-id`, which is what `RichText` already emits, so the
 * two surfaces address a block the same way.
 */
export const BlockId = Extension.create({
  name: 'blockId',
  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'listItem',
          'blockquote',
          'codeBlock',
          'horizontalRule',
          // Without this an attachment's id is re-minted on every save, and
          // every comment anchored to it stops resolving — §13.3's whole
          // reason for a block having an address.
          'attachment',
        ],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-block-id'),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.blockId ? { 'data-block-id': String(attributes.blockId) } : {},
          },
        },
      },
    ]
  },
})

/**
 * A `nostr:` reference, drawn as the thing it points at — SPEC §13.1.
 *
 * An **atom**: it has no editable interior, because its text is the URI and
 * nobody edits half a `naddr`. Selecting it selects the whole reference, which
 * is also how deleting one works.
 *
 * It draws through the same {@link Reference} the reading surface uses, so a
 * project keeps its name and its status while a person is typing beside it.
 * That is the whole of "1:1" as far as this node is concerned — the
 * alternative is bech32 in the middle of a sentence the moment you click.
 */
export const ReferenceNode = Node.create({
  name: 'reference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      uri: { default: '' },
      /** The run's other marks, carried so a bold reference comes back bold. */
      marks: { default: [] as string[] },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-reference]' }]
  },

  renderHTML({ node }) {
    // Only reached by a copy to the clipboard as HTML; the editor itself draws
    // the node view below.
    return ['span', { 'data-reference': String(node.attrs.uri) }, String(node.attrs.uri)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceView)
  },
})

function ReferenceView({ node }: { node: { attrs: Record<string, unknown> } }) {
  const { resolved, nameOf } = useContext(ReferenceContext)
  const uri = String(node.attrs.uri ?? '')
  return (
    <NodeViewWrapper as="span" className="inline">
      <Reference uri={uri} object={resolved[uri]} nameOf={nameOf} />
    </NodeViewWrapper>
  )
}

/**
 * A block this editor has no design for, kept whole.
 *
 * §13.3: a reader MUST render an unknown block's inline text and MUST NOT drop
 * it silently. **An editor is the dangerous case** — ProseMirror discards a
 * node its schema does not know, and the save after that would delete somebody
 * else's `table` or `widget` with no error anywhere on the way. So the block's
 * own JSON rides in an attribute and `fromEditorDocument` hands it back
 * untouched.
 *
 * Not editable, deliberately. Ship cannot draw a table yet, and an affordance
 * that lets a person change something they cannot see is worse than one that
 * says the content is there and belongs to another surface.
 */
export const UnknownBlock = Node.create({
  name: 'unknownBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      source: { default: null as Block | null },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-unknown-block]' }]
  },

  renderHTML({ node }) {
    return ['div', { 'data-unknown-block': String(node.attrs.blockId ?? '') }, '']
  },

  addNodeView() {
    return ReactNodeViewRenderer(UnknownBlockView)
  },
})

function UnknownBlockView({ node }: { node: { attrs: Record<string, unknown> } }) {
  const source = node.attrs.source as Block | null
  const text = source ? inlineTextOf(source) : ''
  return (
    <NodeViewWrapper
      data-block-id={source?.id}
      data-block-type={source?.type}
      className="rounded-md border border-border-default bg-bg-inset px-2 py-1 text-text-secondary"
    >
      {text || `A ${source?.type ?? 'block'} this app cannot edit yet.`}
    </NodeViewWrapper>
  )
}

/**
 * A file placed in a description — SPEC §13.3's `attachment` block, SHI-2.
 *
 * An atom: the file is the block, there is nothing inside it to edit, and a
 * caret that could sit "inside" an image is a way to produce documents no
 * reader has a rule for. Selectable and deletable, so removing one is Backspace
 * like anything else.
 *
 * `attrs` are the `imeta` fields exactly, because that is what §13.3 specifies
 * and it is what lets {@link Attachment} — written for a message's files —
 * draw this one with no second implementation. Each is declared here, and that
 * is not boilerplate: ProseMirror **drops an attribute its schema does not
 * name**, so an undeclared `thumb` would survive the editor and vanish on save,
 * which is the same silent-deletion failure `UnknownBlock` exists to prevent.
 */
export const AttachmentNode = Node.create({
  name: 'attachment',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      url: { default: '' },
      m: { default: '' },
      x: { default: '' },
      size: { default: 0 },
      dim: { default: null },
      thumb: { default: null },
      alt: { default: null },
      filename: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-attachment-block]' }]
  },

  renderHTML({ node }) {
    // Only reached by a copy to the clipboard; the editor draws the node view.
    return ['div', { 'data-attachment-block': String(node.attrs.x ?? '') }, String(node.attrs.filename ?? 'attachment')]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentBlockView)
  },
})

function AttachmentBlockView({ node }: { node: { attrs: Record<string, unknown> } }) {
  const file = node.attrs as unknown as Imeta
  return (
    <NodeViewWrapper className="my-2">
      {/* Drawn, never opened: this editor saves on blur, and a link or a Download button would take focus. */}
      <Attachment file={file} opens={false} />
    </NodeViewWrapper>
  )
}
