/**
 * A description's blocks in the page's other parts (RIC-18): a link to one
 * block and where it lands, a comment started from one block's menu, and what
 * a reader who cannot edit is offered.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveForeign: vi.fn(async () => null),
}))
import { ThreadListView } from '@/components/conversations/ThreadList'
import { useBlockComment } from '@/components/conversations/useBlockComment'
import { LiveHeader } from './LiveHeader'
import { blockLink, linkedBlock } from './blockRows'

const DESCRIPTION = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'paragraph', id: 'b1', content: [{ type: 'text', text: 'first part' }] },
    { type: 'paragraph', id: 'b2', content: [{ type: 'text', text: 'second part' }] },
  ],
})

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
})

describe('a block link', () => {
  it('is the page with the block as its fragment, and reads back to the block', () => {
    const at = { origin: 'https://ship.example', pathname: '/issue/d1' } as Location
    const link = blockLink('b2', at)
    expect(link).toBe('https://ship.example/issue/d1#block-b2')
    expect(linkedBlock(new URL(link).hash)).toBe('b2')
    expect(linkedBlock('#something-else')).toBeUndefined()
    expect(linkedBlock('')).toBeUndefined()
    // Cut mid-escape when pasted: the page opens anyway.
    expect(linkedBlock('#block-%E0')).toBeUndefined()
  })

  it('to a block that was removed says so above the description', () => {
    window.history.replaceState({}, '', '/issue/d1#block-gone')
    render(<LiveHeader title="T" titlePlaceholder="Untitled" onRename={() => true} description={DESCRIPTION} format="blocks" onDescribe={() => true} readOnly />)
    expect(screen.getByText('That part of the description was removed.')).toBeTruthy()
  })

  it('to a block that is there says nothing', () => {
    window.history.replaceState({}, '', '/issue/d1#block-b2')
    render(<LiveHeader title="T" titlePlaceholder="Untitled" onRename={() => true} description={DESCRIPTION} format="blocks" onDescribe={() => true} readOnly />)
    expect(screen.queryByText('That part of the description was removed.')).toBeNull()
  })
})

describe('a reader who cannot edit', () => {
  it('gets the block menu with Copy link and Comment, and Comment hands up the block', async () => {
    const onComment = vi.fn()
    render(<LiveHeader title="T" titlePlaceholder="Untitled" onRename={() => true} description={DESCRIPTION} format="blocks" onDescribe={() => true} readOnly onCommentOnBlock={onComment} />)
    const user = userEvent.setup()
    // A reader's description is the shared editor, only read (WBD-7): its block handle, once the editor has arrived.
    await screen.findByRole('textbox', { name: 'Description' }, { timeout: 5000 })
    // jsdom lays nothing out: every top is 0, so the pointer is on the last block.
    await user.hover(screen.getByText('second part'))
    const handle = screen.getByRole('button', { name: 'Block menu' })
    expect(handle.getAttribute('draggable')).toBe('false')
    // Base UI opens a menu on the press.
    await user.pointer({ keys: '[MouseLeft>]', target: handle })
    await user.pointer({ keys: '[/MouseLeft]', target: handle })
    await screen.findByRole('menu')
    expect(screen.getAllByRole('menuitem').map((r) => r.textContent)).toEqual(['Copy link', 'Comment'])
    await user.click(screen.getByRole('menuitem', { name: 'Comment' }))
    expect(onComment).toHaveBeenCalledWith('b2')
  })
})

describe('a comment from a block’s menu', () => {
  it('goes to the Activity tab with that block as the anchor, and posting sends it once', async () => {
    const onTab = vi.fn()
    const onStart = vi.fn(async (): Promise<true | string> => true)
    const { result } = renderHook(() => useBlockComment(DESCRIPTION, 'blocks', onTab, onStart))
    act(() => result.current.start('b1'))
    expect(onTab).toHaveBeenCalledWith('activity')
    expect(result.current.anchor).toMatchObject({ state: 'resolved', id: 'b1' })
    await act(() => result.current.post('about this', [], undefined, 'b1'))
    expect(onStart).toHaveBeenCalledWith('about this', [], undefined, 'b1')
    expect(result.current.anchor).toBeUndefined()
  })

  it('keeps the anchor when the post is refused, so nothing typed loses its subject', async () => {
    const { result } = renderHook(() => useBlockComment(DESCRIPTION, 'blocks', () => {}, async () => 'refused'))
    act(() => result.current.start('b1'))
    await act(() => result.current.post('about this', [], undefined, 'b1'))
    expect(result.current.anchor).toMatchObject({ id: 'b1' })
  })

  it('draws the block above the composer, which can be told it is about the whole page instead', async () => {
    const onDrop = vi.fn()
    render(<ThreadListView threads={[]} onStart={async () => true} onReply={async () => true} anchor={{ state: 'resolved', id: 'b1', block: { type: 'paragraph', id: 'b1', content: [{ type: 'text', text: 'first part' }] } } as never} onDropAnchor={onDrop} />)
    expect(document.querySelector('[data-pending-anchor="b1"]')?.textContent).toContain('first part')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove' }))
    expect(onDrop).toHaveBeenCalled()
  })
})
