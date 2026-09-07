/**
 * Reactions reach the screen — CON-2.
 *
 * `scripts/reactions.test.ts` asserts the fold is right. This asserts the fold
 * is *rendered*, which is a different claim — a correct predicate wired to
 * nothing is how Peek shipped a read path that never ran, and the reason
 * `ConversationThread.unread.test.tsx` exists.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Reactions, reactorLabel } from './Reactions'

const ANA = 'a'.repeat(64)
const RAVI = 'b'.repeat(64)
const nameOf = (pubkey: string) => ({ [ANA]: 'Ana Duarte', [RAVI]: 'Ravi Mehta' })[pubkey] ?? pubkey

describe('Reactions', () => {
  it('draws one pill per emoji, with its count', () => {
    const c = render(
      <Reactions reactions={[{ emoji: '👍', count: 2, by: [ANA, RAVI] }, { emoji: '🎉', count: 1, by: [ANA] }]} nameOf={nameOf} />,
    ).container
    expect(c.querySelector('[data-reactions]')?.getAttribute('data-reactions')).toBe('2')
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('👍')).toBeTruthy()
  })

  /* A message nobody reacted to must draw nothing at all — an empty row would
     put a gap under every message in every thread. */
  it('renders nothing when there are no reactions', () => {
    expect(render(<Reactions reactions={[]} />).container.firstChild).toBeNull()
    expect(render(<Reactions reactions={undefined} />).container.firstChild).toBeNull()
  })

  it('names the reactors rather than showing keys', () => {
    expect(reactorLabel({ emoji: '👍', count: 2, by: [ANA, RAVI] }, nameOf)).toBe('Ana Duarte and Ravi Mehta reacted with 👍')
  })

  it('reads as one person for a single reactor', () => {
    expect(reactorLabel({ emoji: '👍', count: 1, by: [ANA] }, nameOf)).toBe('Ana Duarte reacted with 👍')
  })

  /* An anonymous participant is anonymous — the rule `profiles.ts` keeps
     everywhere else. "unknown" would be a claim about a person. */
  it('leaves a key with no profile as a shortened key', () => {
    expect(reactorLabel({ emoji: '🚀', count: 1, by: ['f'.repeat(64)] })).toBe('ffffffff… reacted with 🚀')
  })

  /*
    Ship cannot publish a kind:7 — `estiva-ship`'s allowedKinds has no 7 — so
    nothing here may look like a control that would fail at the last step.
  */
  it('offers no way to react, because Ship cannot sign one', () => {
    const c = render(<Reactions reactions={[{ emoji: '👍', count: 1, by: [ANA] }]} nameOf={nameOf} />).container
    expect(c.querySelectorAll('button').length).toBe(0)
  })
})
