import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer'

describe('Composer', () => {
  it('submits trimmed text on Enter, never submits empty, and clears only when the post succeeded', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<Composer onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Start a conversation…' })
    const post = screen.getByRole('button', { name: 'Post' })
    expect(post).toBeDisabled()

    fireEvent.submit(input.closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '  hello  ' } })
    expect(post).toBeEnabled()
    fireEvent.submit(input.closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith('hello', [])
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('keeps the text when the post fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    render(<Composer kind="reply" onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Reply…' })
    fireEvent.change(input, { target: { value: 'still here' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toBeEnabled())
    expect(input).toHaveValue('still here')
  })

  /*
    Attaching a file — SHI-2.

    The upload is injected, so none of this needs a relay. What it pins is the
    ordering the relay forces on us: `onSubmit` may only ever be handed files
    that already uploaded, because ingest refuses a message naming a blob it
    does not hold. Everything below is a way of getting that wrong.
  */
  const FILE_SHA = 'f'.repeat(64)
  const meta = { url: `/media/${FILE_SHA}.png`, m: 'image/png', x: FILE_SHA, size: 12, filename: 'shot.png' }
  /* The input is deliberately out of the accessibility tree — the button is the
     control — so it is reached the way the page reaches it, by the element. */
  const pick = (container: HTMLElement, name = 'shot.png') =>
    fireEvent.change(container.querySelector('[data-composer="picker"]')!, {
      target: { files: [new File(['x'], name, { type: 'image/png' })] },
    })

  it('uploads a chosen file and hands it to onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const upload = vi.fn().mockResolvedValue(meta)
    const { container } = render(<Composer onSubmit={onSubmit} upload={upload} />)

    pick(container)
    expect(await screen.findByText('shot.png')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Start a conversation…' }), { target: { value: 'look' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('look', [meta]))
    // Posted files do not carry over into the next message.
    await waitFor(() => expect(screen.queryByText('shot.png')).not.toBeInTheDocument())
  })

  it('posts a message that is only a file', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const { container } = render(<Composer onSubmit={onSubmit} upload={vi.fn().mockResolvedValue(meta)} />)
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled()

    pick(container)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Post' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('', [meta]))
  })

  it('says why an upload was refused, and attaches nothing', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const upload = vi.fn().mockRejectedValue(new Error('file exceeds 10 MiB'))
    const { container } = render(<Composer onSubmit={onSubmit} upload={upload} />)

    pick(container)
    // The relay's own words, not "upload failed" — this one is actionable.
    expect(await screen.findByRole('alert')).toHaveTextContent('file exceeds 10 MiB')

    fireEvent.change(screen.getByRole('textbox', { name: 'Start a conversation…' }), { target: { value: 'anyway' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    // The message still goes, carrying no file. A refused upload costs the
    // attachment and nothing else.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('anyway', []))
  })

  it('keeps an attachment when the post is refused, so a retry costs no upload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false)
    const { container } = render(<Composer onSubmit={onSubmit} upload={vi.fn().mockResolvedValue(meta)} />)
    pick(container)
    expect(await screen.findByText('shot.png')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.getByText('shot.png')).toBeInTheDocument()
  })

  it('removes an attachment before it is posted', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    const { container } = render(<Composer onSubmit={onSubmit} upload={vi.fn().mockResolvedValue(meta)} />)
    pick(container)
    expect(await screen.findByText('shot.png')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove shot.png' }))
    await waitFor(() => expect(screen.queryByText('shot.png')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled()
  })
})
