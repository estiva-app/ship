/**
 * A file Ship lists by itself, as the kit's row or card (Katerina, 30 Oct,
 * widget review 52): what a reader sees of it, and that "cannot see it" never
 * reads as "it is empty". The widgets' own looks are the kit's, tested there.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ForeignObject } from './ForeignObject'
import type { ForeignObject as Data } from '@/api/foreign'

const PK = 'a'.repeat(64)
const base = (over: Partial<Data> = {}): Data => ({
  ref: `30840:${PK}:uuid`,
  address: `30840:${PK}:uuid`,
  eventId: 'e'.repeat(64),
  kind: 30840,
  widget: 'card',
  appName: 'Peek',
  openUrl: 'https://peek.estiva.app/o/naddr1topic',
  slots: { title: { value: 'design' } },
  meta: [],
  comments: [],
  actions: [],
  viaRecommendation: true,
  ...over,
})

describe('ForeignObject', () => {
  it('draws a message as a person and their words, opening it in its app', () => {
    const openUrl = 'https://peek.estiva.app/o/nevent1qqs'
    render(
      <ForeignObject
        object={base({
          ref: 'f'.repeat(64),
          address: undefined,
          kind: 9,
          widget: ['message', 'card'],
          noun: 'message',
          openUrl,
          slots: { title: { value: PK, isPubkey: true }, body: { value: 'hello there' } },
          people: { [PK]: { displayName: 'Miky' } },
        })}
      />,
    )
    expect(screen.getByRole('link', { name: 'Miky' }).getAttribute('href')).toBe(openUrl)
    expect(screen.getByText('hello there')).toBeInTheDocument()
  })

  it('draws the card or the row its manifest asks for, and a widget it does not know rather than refusing', () => {
    const { container, rerender } = render(<ForeignObject object={base()} />)
    expect(container.querySelector('[data-widget="card"]')?.textContent).toContain('design')
    rerender(<ForeignObject object={base({ widget: 'row' })} />)
    expect(container.querySelector('[data-widget="row"]')?.textContent).toContain('design')
    rerender(<ForeignObject object={base({ widget: ['hologram'] })} />)
    expect(container.querySelector('[data-foreign-object]')?.textContent).toContain('design')
  })

  it('labels the file by its type', () => {
    render(<ForeignObject object={base({ noun: 'topic' })} />)
    expect(screen.getByText(/Topic/)).toBeInTheDocument()
  })

  it('never puts a raw pubkey on screen when nobody published a name', () => {
    render(<ForeignObject object={base({ meta: [{ label: 'Lead', value: 'b'.repeat(64), isPubkey: true }] })} />)
    expect(document.body.textContent).not.toContain('b'.repeat(64))
  })

  it('says "not available" for a file this reader may not see, with the way to open it where it lives — never as an empty one', () => {
    // The relay answers both with nothing. A screen that draws one state for
    // both quietly lies, and the reader cannot tell which they are looking at.
    const { rerender } = render(<ForeignObject object={base({ noun: 'topic', unreachable: true })} />)
    expect(screen.getByText('Topic not available')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open in Peek/ }).getAttribute('href')).toBe('https://peek.estiva.app/o/naddr1topic')
    rerender(<ForeignObject object={base({ noun: 'topic', children: [] })} />)
    expect(screen.queryByText(/not available/)).toBeNull()
    expect(screen.getByText('design')).toBeInTheDocument()
  })

  it('lists the files inside a card, each opening on its own', () => {
    render(
      <ForeignObject
        object={base({
          children: [base({ ref: `30851:${PK}:child`, address: `30851:${PK}:child`, kind: 30851, widget: 'row', openUrl: 'https://ship.estiva.app/issue/child', slots: { title: { value: 'A child issue' } } })],
        })}
      />,
    )
    expect(screen.getByText('design')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /A child issue/ })).toBeInTheDocument()
  })

  it('draws the comment count the caller read, opening the conversation, and none when it read none', () => {
    const { rerender } = render(<ForeignObject object={base({ widget: 'row' })} conversations={4} />)
    expect(screen.getByRole('link', { name: /comments — open the conversation/ }).textContent).toContain('4')
    rerender(<ForeignObject object={base({ widget: 'row' })} />)
    expect(screen.queryByRole('link', { name: /open the conversation/ })).toBeNull()
  })
})
