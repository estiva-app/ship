/**
 * Related — nesting is by intent (RFC 0.5 §10.7), on the project and issue pages.
 *
 * What is pinned: a foreign file placed under one of Ship's objects reaches
 * that object's page with its count; the three states the read can be in —
 * unread, empty, failed — never collapse into one another on screen (peek#189's
 * invariant); and the filter is "not mine", with no kind named in it.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ForeignObject as Data } from '@/api/foreign'

// The relay is the only thing stubbed: `readRelated` is the folder read plus
// the counts, and both are the runtime's. `pickWidget` stays real because a
// bare file's card is drawn through the chain like anything else.
const readRelated = vi.fn()
vi.mock(import('@/api/foreign'), async (importOriginal) => ({
  ...(await importOriginal()),
  readRelated: (folder: string, address: string) => readRelated(folder, address),
}))

import { useRelated } from '@/api/useRelated'
import { Related, hasRelated } from './Related'

const PROJECT = '30850:pk:proj'

const file = (over: Partial<Data> = {}): Data =>
  ({
    ref: '30840:pk:t1',
    address: '30840:pk:t1',
    eventId: 'e',
    kind: 30840,
    widget: 'card',
    appName: 'File',
    slots: { title: { value: 'Design review' } },
    meta: [],
    comments: [],
    parentRef: PROJECT,
    ...over,
  }) as Data

/** A page, reduced to the one section under test. */
function Page({ folder, address }: { folder?: string; address?: string }) {
  const related = useRelated(folder, address)
  return (
    <div>
      {hasRelated(related) && (
        <section>
          <h2>Related</h2>
          <Related related={related} />
        </section>
      )}
      <p data-state={related === undefined ? 'unread' : related === 'failed' ? 'failed' : 'read'} />
    </div>
  )
}

describe('Related', () => {
  it('a bare-file topic placed under the project appears with its comment count', async () => {
    readRelated.mockResolvedValue({ files: [file()], counts: { '30840:pk:t1': 3 } })
    render(<Page folder="f1" address={PROJECT} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Related' })).toBeInTheDocument())
    expect(screen.getByText('Design review')).toBeInTheDocument()
    expect(screen.getByLabelText('3 comments')).toBeInTheDocument()
    // Read from the object's own Folder, filtered to the object — the two
    // arguments the page hands over, nothing else.
    expect(readRelated).toHaveBeenCalledWith('f1', PROJECT)
  })

  it('a zero count draws no badge — a real zero is not "no discussion"', async () => {
    readRelated.mockResolvedValue({ files: [file()], counts: { '30840:pk:t1': 0 } })
    render(<Page folder="f1" address={PROJECT} />)
    await waitFor(() => expect(screen.getByText('Design review')).toBeInTheDocument())
    expect(screen.queryByLabelText(/comment/)).not.toBeInTheDocument()
  })

  it('any kind, not only 30840 — a file from an app nobody here has heard of is Related too', async () => {
    readRelated.mockResolvedValue({
      files: [file({ ref: 'x', address: '30911:pk:x', kind: 30911, appName: 'Tide table', widget: ['tideboard', 'card'], slots: { title: { value: 'Spring tides' } } })],
      counts: { x: 1 },
    })
    render(<Page folder="f1" address={PROJECT} />)
    await waitFor(() => expect(screen.getByText('Spring tides')).toBeInTheDocument())
    expect(document.querySelector('[data-widget="card"]')).toBeTruthy()
    expect(screen.getByLabelText('1 comment')).toBeInTheDocument()
  })

  it('nothing placed here: no heading, and the state is read — not unread', async () => {
    readRelated.mockResolvedValue({ files: [], counts: {} })
    render(<Page folder="f1" address={PROJECT} />)
    await waitFor(() => expect(document.querySelector('[data-state="read"]')).toBeTruthy())
    expect(screen.queryByRole('heading', { name: 'Related' })).not.toBeInTheDocument()
  })

  it('a read that failed says so, and is never mistaken for nothing placed here', async () => {
    // Rejects on a later tick — see FolderPage.test for why an already-rejected
    // promise trips the runner rather than the component.
    readRelated.mockImplementation(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('nope')), 0)))
    render(<Page folder="f1" address={PROJECT} />)
    await waitFor(() => expect(screen.getByText('Files placed under this could not be read.')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Related' })).toBeInTheDocument()
    expect(document.querySelector('[data-state="failed"]')).toBeTruthy()
  })

  it('an object the fold does not have reads as empty, not pending', async () => {
    readRelated.mockClear()
    render(<Page />)
    await waitFor(() => expect(document.querySelector('[data-state="read"]')).toBeTruthy())
    expect(readRelated).not.toHaveBeenCalled()
  })

  it('re-reads when the tab is looked at again, and keeps the screen while it does', async () => {
    readRelated.mockResolvedValue({ files: [file()], counts: { '30840:pk:t1': 3 } })
    render(<Page folder="f1" address={PROJECT} />)
    await waitFor(() => expect(screen.getByText('Design review')).toBeInTheDocument())
    const before = readRelated.mock.calls.length

    // Somebody started a second topic in Peek; the person switches back.
    readRelated.mockResolvedValue({
      files: [file(), file({ ref: '30840:pk:t2', address: '30840:pk:t2', slots: { title: { value: 'Second look' } } })],
      counts: { '30840:pk:t1': 3, '30840:pk:t2': 0 },
    })
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    // The first card never left the screen.
    expect(screen.getByText('Design review')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Second look')).toBeInTheDocument())
    expect(readRelated.mock.calls.length).toBe(before + 1)
  })
})

describe('hasRelated', () => {
  it('draws the heading for files and for a failure, and for nothing else', () => {
    expect(hasRelated(undefined)).toBe(false)
    expect(hasRelated({ files: [], counts: {} })).toBe(false)
    expect(hasRelated({ files: [file()], counts: {} })).toBe(true)
    expect(hasRelated('failed')).toBe(true)
  })
})
