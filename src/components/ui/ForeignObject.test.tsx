import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ForeignObject } from './ForeignObject'
import { pickWidget } from '@/api/foreign'
import type { ForeignObject as Data } from '@/api/foreign'

const base = (over: Partial<Data> = {}): Data => ({
  ref: '39000:relay:uuid',
  eventId: 'e'.repeat(64),
  kind: 39000,
  widget: 'card',
  appName: 'Peek',
  slots: { title: { value: 'design' } },
  meta: [],
  comments: [],
  actions: [],
  viaRecommendation: true,
  ...over,
})

/**
 * The fallback chain — RFC 0.4 §13.3, and Ship is its first consumer anywhere.
 *
 * A widget is a layout hint rather than a semantic, so an unknown one degrades.
 * The property that matters is that it degrades to *something*: §13.3's whole
 * argument is that a blank object is indistinguishable from one the reader may
 * not see, and reports "that app is broken" about an app behaving correctly.
 */
const IMPLEMENTED = ['message', 'card', 'row'] as const

describe('the widget fallback chain, as Ship implements it', () => {
  it('takes the first type it implements', () => {
    expect(pickWidget(['message', 'card'], IMPLEMENTED, 'card')).toBe('message')
  })

  it('walks past a type it has never heard of', () => {
    expect(pickWidget(['kanban', 'card'], IMPLEMENTED, 'card')).toBe('card')
  })

  it('honours the whole chain, not only its first entry', () => {
    expect(pickWidget(['gantt', 'burndown', 'row'], IMPLEMENTED, 'card')).toBe('row')
  })

  it('accepts a bare string, which is the older form', () => {
    expect(pickWidget('card', IMPLEMENTED, 'card')).toBe('card')
  })

  it('never returns nothing, even for a chain it fully fails to walk', () => {
    // A producer must terminate its chain in a closed type; this is what
    // happens when one does not. Rendering a card beats rendering a blank.
    expect(pickWidget(['kanban', 'gantt'], IMPLEMENTED, 'card')).toBe('card')
    expect(pickWidget([], IMPLEMENTED, 'card')).toBe('card')
  })
})

describe('ForeignObject', () => {
  it('renders a message as a person and a body, not as a card', () => {
    render(
      <ForeignObject
        object={base({
          kind: 9,
          widget: ['message', 'card'],
          slots: { title: { value: 'a'.repeat(64), isPubkey: true }, body: { value: 'hello there' } },
          people: { ['a'.repeat(64)]: { displayName: 'Miky' } },
        })}
      />,
    )
    expect(screen.getByText('Miky')).toBeInTheDocument()
    expect(screen.getByText('hello there')).toBeInTheDocument()
  })

  it('shows a body as text, never as markup', () => {
    // Ship's discipline, and it has to survive contact with another app's
    // content: 41% of production messages carry markdown.
    render(
      <ForeignObject
        object={base({
          kind: 9,
          widget: ['message', 'card'],
          slots: { title: { value: 'a'.repeat(64), isPubkey: true }, body: { value: '**bold** and `code`' } },
        })}
      />,
    )
    expect(screen.getByText('**bold** and `code`')).toBeInTheDocument()
    expect(document.querySelector('strong')).toBeNull()
    expect(document.querySelector('code')).toBeNull()
  })

  it('renders an unknown widget rather than refusing', () => {
    render(<ForeignObject object={base({ widget: ['hologram'] })} />)
    expect(screen.getByText('design')).toBeInTheDocument()
  })

  it('never puts a raw pubkey on screen when nobody published a name', () => {
    render(
      <ForeignObject
        object={base({
          meta: [{ label: 'Lead', value: 'b'.repeat(64), isPubkey: true }],
        })}
      />,
    )
    expect(screen.queryByText('b'.repeat(64))).toBeNull()
  })

  it('distinguishes "cannot see it" from "it is empty"', () => {
    // The relay answers both with nothing. A screen that draws one state for
    // both quietly lies, and the reader cannot tell which they are looking at.
    const { rerender } = render(<ForeignObject object={base({ unreachable: true })} />)
    expect(screen.getByText(/may not have access/i)).toBeInTheDocument()

    rerender(<ForeignObject object={base({ children: [] })} />)
    expect(screen.queryByText(/may not have access/i)).toBeNull()
    expect(screen.getByText(/nothing in it yet/i)).toBeInTheDocument()
  })

  it('says nothing about a list that was never declared', () => {
    render(<ForeignObject object={base({ children: undefined })} />)
    expect(screen.queryByText(/nothing in it yet/i)).toBeNull()
  })

  it('renders children through their own projection', () => {
    render(
      <ForeignObject
        object={base({
          children: [
            base({
              ref: 'child-1',
              kind: 9,
              widget: ['message', 'card'],
              slots: { title: { value: 'c'.repeat(64), isPubkey: true }, body: { value: 'first' } },
              people: { ['c'.repeat(64)]: { displayName: 'Ana' } },
            }),
          ],
        })}
      />,
    )
    // The parent is a card; the child is drawn as a message, from its own
    // declaration rather than the parent's.
    expect(screen.getByText('design')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('first')).toBeInTheDocument()
  })
})
