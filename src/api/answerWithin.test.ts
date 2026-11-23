import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { failureReasonOf } from '@estiva-app/platform'
import { READ_ANSWER_MS, answerWithin } from './answerWithin'

/** A request that never answers, and ends only when its signal does, as `fetch` does. */
const never = (init: RequestInit | undefined): Promise<string> =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
  })

describe('answerWithin', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('ends a read the relay never answers, as not reached', async () => {
    const read = answerWithin('https://relay.example/query', undefined, never)
    const failed = read.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(READ_ANSWER_MS - 1)
    expect(await Promise.race([failed, Promise.resolve('waiting')])).toBe('waiting')
    await vi.advanceTimersByTimeAsync(1)
    const error = await failed
    expect((error as Error).name).toBe('TimeoutError')
    expect(failureReasonOf(error)).toBe('not-reached')
  })

  it('hands an answered read on and stops its clock', async () => {
    const answer = await answerWithin('https://relay.example/query?x=1', undefined, async () => 'answered')
    expect(answer).toBe('answered')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves a write to take as long as it takes', async () => {
    let seen: RequestInit | undefined = { method: 'unset' }
    const write = answerWithin('https://relay.example/publish', undefined, (init) => {
      seen = init
      return never(init)
    })
    const settled = vi.fn()
    void write.then(settled, settled)
    await vi.advanceTimersByTimeAsync(READ_ANSWER_MS * 3)
    expect(seen).toBeUndefined()
    expect(settled).not.toHaveBeenCalled()
  })

  it('still ends when the caller ends it', async () => {
    const caller = new AbortController()
    const read = answerWithin('https://relay.example/query', { signal: caller.signal }, never)
    const failed = read.catch((error: unknown) => error)
    caller.abort(new DOMException('left', 'AbortError'))
    expect(((await failed) as Error).name).toBe('AbortError')
    expect(vi.getTimerCount()).toBe(0)
  })
})
