import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./foreign', () => ({ readFileTopics: vi.fn() }))
vi.mock('./writes', () => ({ setListedInTopic: vi.fn() }))

import { readFileTopics, type TopicOfFile } from './foreign'
import { setListedInTopic } from './writes'
import { useFileTopics } from './useFileTopics'

const topic = (d: string, title: string): TopicOfFile => ({ address: `30840:${'a'.repeat(64)}:${d}`, folder: 'team', title, archived: false })
const WIDGETS = topic('w', 'Widgets')
const DESIGN = topic('d', 'Design')

beforeEach(() => {
  vi.mocked(readFileTopics).mockReset().mockResolvedValue([WIDGETS])
  vi.mocked(setListedInTopic).mockReset()
})

describe('useFileTopics: Add to topic and Remove on a file (TOP-5)', () => {
  it('writes the entry by the file’s id, and the topic shows at once, A–Z', async () => {
    vi.mocked(setListedInTopic).mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useFileTopics('issue-1'))
    await waitFor(() => expect(result.current.state).toEqual([WIDGETS]))
    // The re-read after the write may not hold it yet; what was written stays drawn.
    vi.mocked(readFileTopics).mockResolvedValue([DESIGN, WIDGETS])
    await act(async () => void (await result.current.setListed(DESIGN, true)))
    expect(setListedInTopic).toHaveBeenCalledWith(DESIGN, 'issue-1', true)
    expect(result.current.state).toEqual([DESIGN, WIDGETS])
  })

  it('a refused add takes the topic back off, and says why', async () => {
    vi.mocked(setListedInTopic).mockResolvedValue({ ok: false, reason: 'restricted: not a channel member' })
    const { result } = renderHook(() => useFileTopics('issue-1'))
    await waitFor(() => expect(result.current.state).toEqual([WIDGETS]))
    // The re-read after the write never lands: what is drawn is the rollback alone.
    vi.mocked(readFileTopics).mockReturnValue(new Promise(() => undefined))
    let answer
    await act(async () => void (answer = await result.current.setListed(DESIGN, true)))
    expect(answer).toEqual({ ok: false, reason: 'restricted: not a channel member' })
    expect(result.current.state).toEqual([WIDGETS])
  })

  it('a refused remove puts the topic back', async () => {
    vi.mocked(setListedInTopic).mockResolvedValue({ ok: false, reason: 'restricted' })
    const { result } = renderHook(() => useFileTopics('issue-1'))
    await waitFor(() => expect(result.current.state).toEqual([WIDGETS]))
    vi.mocked(readFileTopics).mockReturnValue(new Promise(() => undefined))
    await act(async () => void (await result.current.setListed(WIDGETS, false)))
    expect(result.current.state).toEqual([WIDGETS])
  })

  it('a failed first read says so', async () => {
    vi.mocked(readFileTopics).mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useFileTopics('issue-1'))
    await waitFor(() => expect(result.current.state).toBe('failed'))
  })
})
