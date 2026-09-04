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
import { addrToNaddr, encodeNpub } from '@estiva-app/protocol'
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
