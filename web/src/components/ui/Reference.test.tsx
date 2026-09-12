/**
 * One component for every kind of reference — RIC-10.
 *
 * Miky's note: "everything you mention is basically a file. Even things like
 * different topic, message, or even specific person." So a person and a project
 * are the same idea pointed at two things, and this draws whatever the URI
 * turns out to name rather than the caller knowing in advance.
 *
 * Two mechanisms side by side is how the display-name mention drifted away from
 * the projection layer; this replaces `MentionChip`, which knew only people.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { addrToNaddr, encodeNevent, encodeNpub } from '@estiva-app/protocol'
import type { ForeignObject } from '@/api/foreign'
import { Reference } from './Reference'

const ADA = 'b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46'
const NPUB = `nostr:${encodeNpub(ADA)}`
const NADDR = `nostr:${addrToNaddr(`30851:${ADA}:an-issue`)}`
const nameOf = (pubkey: string) => (pubkey === ADA ? 'Ada Lovelace' : `${pubkey.slice(0, 8)}…`)

const anIssue = (status?: string): ForeignObject =>
  ({
    ref: '30851:x:an-issue',
    slots: { title: { value: 'Ship it' }, ...(status ? { status: { value: status } } : {}) },
  }) as unknown as ForeignObject

describe('Reference', () => {
  it('draws a person from the directory', () => {
    const c = render(<Reference uri={NPUB} nameOf={nameOf} />).container
    expect(c.querySelector('[data-reference="person"]')).not.toBeNull()
    expect(c.textContent).toBe('@Ada Lovelace')
  })

  it('draws an object from its own projection', () => {
    const c = render(<Reference uri={NADDR} object={anIssue()} />).container
    expect(c.querySelector('[data-reference="object"]')).not.toBeNull()
    expect(c.textContent).toContain('Ship it')
  })

  it('shows the status where the manifest declares one', () => {
    // The "maybe the status as icon" half of the ask.
    const c = render(<Reference uri={NADDR} object={anIssue('in_progress')} />).container
    expect(c.textContent).toContain('Ship it')
    expect(c.textContent).toContain('in_progress')
  })

  it('omits the status where it declares none, rather than inventing one', () => {
    const c = render(<Reference uri={NADDR} object={anIssue()} />).container
    expect(c.textContent).toBe('Ship it')
  })

  it('never renders blank — §13.1', () => {
    // Three ways to know nothing, all of which still say a reference is here.
    for (const [label, node] of [
      ['still resolving', <Reference key="a" uri={NADDR} />],
      ['resolved to nothing', <Reference key="b" uri={NADDR} object={null} />],
      ['a person outside the workspace', <Reference key="c" uri={`nostr:${encodeNpub('cd'.repeat(32))}`} nameOf={nameOf} />],
    ] as const) {
      const c = render(node).container
      expect(c.textContent, label).not.toBe('')
    }
  })

  it('tells "still resolving" apart from "resolved to nothing"', () => {
    // Drawn the same, marked differently: neither is something a reader can act
    // on, but they are different facts and a check should be able to see which.
    const pending = render(<Reference uri={NADDR} />).container
    const empty = render(<Reference uri={NADDR} object={null} />).container
    expect(pending.querySelector('[data-reference="pending"]')).not.toBeNull()
    expect(empty.querySelector('[data-reference="unresolved"]')).not.toBeNull()
  })
})

/**
 * A message, through Peek's manifest — RIC-11. It has no title of its own, so
 * the manifest titles it by its author (`field: "pubkey", as: "pubkey"`) and
 * carries the text as `body`. The done-when is that a mention made in Peek
 * resolves *here*, with no shared fixture: the runtime's `people` name the
 * author, and the chip quotes the opening words so a reader knows which
 * message.
 */
describe('Reference, for a message', () => {
  const NEVENT = `nostr:${encodeNevent({ id: 'c'.repeat(64), relays: [], kind: 9 })}`
  const aMessage = (people?: ForeignObject['people'], widget: ForeignObject['widget'] = ['message', 'card']): ForeignObject =>
    ({
      ref: 'nevent1msg',
      kind: 9,
      widget,
      slots: { title: { value: ADA, isPubkey: true }, body: { value: 'The build is green again.' } },
      people,
    }) as unknown as ForeignObject

  it('names the author and quotes the opening words', () => {
    const c = render(<Reference uri={NEVENT} object={aMessage({ [ADA]: { displayName: 'Ada Lovelace' } })} />).container
    expect(c.textContent).toBe('Ada Lovelace: The build is green again.')
  })

  it('never prints the key when the runtime found no profile', () => {
    const c = render(<Reference uri={NEVENT} object={aMessage()} nameOf={nameOf} />).container
    expect(c.textContent).toBe('Ada Lovelace: The build is green again.')
    const stranger = render(<Reference uri={NEVENT} object={aMessage(undefined)} />).container
    expect(stranger.textContent).not.toContain(ADA)
    expect(stranger.textContent).toContain(`${ADA.slice(0, 8)}…`)
  })

  it('draws a person-titled object that is not a message by the name alone', () => {
    // The `message` widget is what makes something a message, not the
    // person-shaped title: a project led by somebody is still a project.
    const c = render(<Reference uri={NADDR} object={aMessage({ [ADA]: { displayName: 'Ada' } }, 'card')} />).container
    expect(c.textContent).toBe('Ada')
  })
})
