/**
 * Members — the pill and the dialog on an issue or project page (SHI-31).
 *
 * What is pinned: nothing is drawn before the first read; "You" leads the
 * roster; somebody with a part who left is still listed, "· not following";
 * Join for a non-member and Leave for a member, each sending the right value
 * once; "Add members" only for a member; no control where membership cannot
 * change.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Members, type MembersProps } from './Members'

const ME = 'c'.repeat(64)
const ANA = 'a'.repeat(64)
const RAVI = 'b'.repeat(64)

const fixture = (props: Partial<MembersProps> = {}) => (
  <Members
    members={new Map([[ME, {}], [ANA, {}]])}
    me={ME}
    people={[{ value: ANA, name: 'Ana Duarte' }, { value: RAVI, name: 'Ravi Mehta' }, { value: ME, name: 'Miky' }]}
    nameOf={(pubkey) => pubkey.slice(0, 8)}
    pictureOf={() => undefined}
    roles={[{ pubkey: ANA, role: 'Author' }]}
    onSetMine={vi.fn(async () => true)}
    onAdd={vi.fn(async () => true)}
    {...props}
  />
)

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /members?$/ }))
  return screen.findByRole('dialog', { name: /Members/ })
}

describe('Members', () => {
  it('draws nothing until membership has been read', () => {
    const { container } = render(fixture({ members: undefined }))
    expect(container.textContent).toBe('')
  })

  it('counts the members on the pill and lists You first, with their part', async () => {
    const user = userEvent.setup()
    render(fixture())
    expect(screen.getByRole('button', { name: '2 members' })).toBeTruthy()
    const dialog = await open(user)
    const text = dialog.textContent ?? ''
    expect(text.indexOf('You')).toBeLessThan(text.indexOf('Ana Duarte'))
    expect(text).toContain('Author')
  })

  it('keeps somebody with a part who left, saying they are not following', async () => {
    const user = userEvent.setup()
    render(fixture({ roles: [{ pubkey: RAVI, role: 'Assignee' }] }))
    expect(within(await open(user)).getByText('Assignee · not following')).toBeTruthy()
  })

  it('offers Leave to a member and sends false, once', async () => {
    const user = userEvent.setup()
    const onSetMine = vi.fn(async () => true)
    render(fixture({ onSetMine }))
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    expect(onSetMine).toHaveBeenCalledExactlyOnceWith(false)
    expect(screen.getByRole('button', { name: 'Add members' })).toBeTruthy()
  })

  it('offers Join to a non-member and sends true, with nothing to add yet', async () => {
    const user = userEvent.setup()
    const onSetMine = vi.fn(async () => true)
    render(fixture({ members: new Map([[ANA, {}]]), onSetMine }))
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(onSetMine).toHaveBeenCalledExactlyOnceWith(true)
    expect(screen.queryByRole('button', { name: 'Add members' })).toBeNull()
  })

  it('offers no Join, Leave or Add where membership cannot change', async () => {
    const user = userEvent.setup()
    render(fixture({ readOnlyReason: 'Signed out' }))
    await open(user)
    expect(screen.queryByRole('button', { name: /^(Join|Leave|Add members)$/ })).toBeNull()
  })
})
