/**
 * An agent's face is the robot wherever Ship draws a face (ui 0.97.0, Katerina, 1 November): the profile's `bot`
 * reaches the kit's face, never initials like a person's. The kit draws the robot as a picture with no letters.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { History } from './History'
import { Members } from './Members'
import { mentionPeople } from './editing/mentionables'

const ME = 'c'.repeat(64)
const AGENT = 'a'.repeat(64)
const STRANGER = 'b'.repeat(64)

/** A face drawn as the robot: no initials, and the robot's glyph. */
const isRobot = (face: Element) => face.textContent === '' && face.querySelector('svg path') !== null

describe('an agent’s face in Ship', () => {
  it('is the robot on the members pill and in the Members dialog, for one known only by key too', async () => {
    const user = userEvent.setup()
    render(
      <Members
        members={new Map([[ME, {}], [AGENT, {}], [STRANGER, {}]])}
        me={ME}
        people={[{ value: AGENT, name: 'Claude', bot: true }, { value: ME, name: 'Miky' }]}
        nameOf={() => 'Helper'}
        personOf={(pubkey) => (pubkey === STRANGER ? { bot: true } : {})}
        roles={[]}
        onSetMine={vi.fn(async () => true)}
        onAdd={vi.fn(async () => true)}
      />,
    )
    const pill = screen.getByRole('button', { name: /members$/ })
    expect(isRobot(within(pill).getByRole('img', { name: 'Claude' }))).toBe(true)
    expect(isRobot(within(pill).getByRole('img', { name: 'Helper' }))).toBe(true)
    expect(isRobot(within(pill).getByRole('img', { name: 'You' }))).toBe(false)
    await user.click(pill)
    const dialog = await screen.findByRole('dialog', { name: /Members/ })
    // A roster row is the face, then the name and its caption.
    const faceOf = (name: string) => within(dialog).getByText(name).parentElement!.parentElement!.firstElementChild!
    expect(isRobot(faceOf('Claude'))).toBe(true)
    expect(isRobot(faceOf('Helper'))).toBe(true)
  })

  it('is the robot in History', () => {
    const { container } = render(<History entries={[{ id: '1', by: { name: 'Claude', bot: true }, at: 1, text: 'set status to Done' }]} />)
    expect(isRobot(container.querySelector('li')!.firstElementChild!)).toBe(true)
  })

  it('is the robot in the list @ offers', () => {
    const people = mentionPeople([AGENT], ME, {
      nameOf: () => 'Claude',
      personOf: () => ({ name: 'Claude', bot: true }),
      profileOf: () => ({ pubkey: AGENT, name: 'Claude', bot: true, createdAt: 1 }),
    })
    const { container } = render(<>{people[0]?.avatar}</>)
    expect(isRobot(container.firstElementChild!)).toBe(true)
  })
})
