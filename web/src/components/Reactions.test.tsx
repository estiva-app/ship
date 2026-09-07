/**
 * Reactions reach the screen — CON-2.
 *
 * `scripts/reactions.test.ts` asserts the fold is right. This asserts the fold
 * is *rendered*, which is a different claim — a correct predicate wired to
 * nothing is how Peek shipped a read path that never ran, and the reason
 * `ConversationThread.unread.test.tsx` exists.
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Reactions, reactorLabel } from './Reactions'
import { REACTION_EMOJI } from '@/api'

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
    Without a handler there is nothing to click. That is a real state, not a
    leftover: a signed-out reader sees what other people did and is offered
    nothing — the rule Button's page states as "a control the person may never
    be allowed to use is absent, not disabled".
  */
  it('offers no controls when no handler is given', () => {
    const c = render(<Reactions reactions={[{ emoji: '👍', count: 1, by: [ANA] }]} nameOf={nameOf} />).container
    expect(c.querySelectorAll('button').length).toBe(0)
    expect(c.querySelector('[data-reaction-picker]')).toBeNull()
  })

  it('offers the picker once a handler is given', () => {
    const c = render(<Reactions reactions={[]} onToggle={() => {}} />).container
    expect(c.querySelector('[data-reaction-picker]')).not.toBeNull()
    // One control per emoji in the shared palette.
    expect(c.querySelectorAll('[data-reaction-picker] button').length).toBe(REACTION_EMOJI.length)
  })

  it('names each picker control by meaning, not by glyph', () => {
    render(<Reactions reactions={[]} onToggle={() => {}} />)
    // An icon-only control has no other source for an accessible name.
    expect(screen.getByRole('button', { name: 'Thank you' })).toBeTruthy()
  })

  /*
    The toggle. Clicking a reaction you are part of hands back `mine` — the id
    of your own reaction event — so the caller retracts rather than adds. That
    id is the whole reason the fold carries it.
  */
  it('hands back your own reaction id when you already reacted', () => {
    const seen: [string, string | undefined][] = []
    render(
      <Reactions
        reactions={[{ emoji: '👍', count: 1, by: [ANA], mine: 'my-reaction-event' }]}
        nameOf={nameOf}
        onToggle={(emoji, mine) => seen.push([emoji, mine])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Makes sense, 1' }))
    expect(seen).toEqual([['👍', 'my-reaction-event']])
  })

  it('hands back no id when the reaction is somebody else’s', () => {
    const seen: [string, string | undefined][] = []
    render(<Reactions reactions={[{ emoji: '👍', count: 1, by: [RAVI] }]} onToggle={(e, m) => seen.push([e, m])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Makes sense, 1' }))
    expect(seen).toEqual([['👍', undefined]])
  })

  /* A button whose visible label is a bare count is named "1" to a screen
     reader. The name has to say which reaction it toggles. */
  it('names a reaction control by meaning and count, not by its number', () => {
    render(<Reactions reactions={[{ emoji: '👍', count: 2, by: [ANA, RAVI] }]} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Makes sense, 2' })).toBeTruthy()
  })

  it('falls back to the glyph for an emoji outside the shared palette', () => {
    render(<Reactions reactions={[{ emoji: '🦆', count: 1, by: [ANA] }]} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: '🦆, 1' })).toBeTruthy()
  })

  it('marks your own reaction as pressed, and others not', () => {
    const c = render(
      <Reactions
        reactions={[{ emoji: '👍', count: 1, by: [ANA], mine: 'e1' }, { emoji: '🎉', count: 1, by: [RAVI] }]}
        onToggle={() => {}}
      />,
    ).container
    const pressed = [...c.querySelectorAll('[aria-pressed]')].map((b) => b.getAttribute('aria-pressed'))
    expect(pressed).toEqual(['true', 'false'])
  })

  /* Signed out: the reason disables rather than lies about what will happen. */
  it('disables every control with a reason when writes are unavailable', () => {
    const c = render(<Reactions reactions={[{ emoji: '👍', count: 1, by: [ANA] }]} onToggle={() => {}} disabledReason="Sign in to react." />).container
    expect([...c.querySelectorAll('button')].every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
  })
})
