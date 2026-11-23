import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { failureReasonOf } from '@estiva-app/platform'
import { READ_SILENCE_MS, answerWithin } from './answerWithin'

const QUERY = 'https://relay.example/query'
const asked = { method: 'POST', body: '[]' }

/** A relay that takes the request and never answers; it ends only when the request's signal does, as `fetch` does. */
const silent = (_url: string, init?: RequestInit): Promise<Response> =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
  })

/** A relay that answers at once and sends the answer's parts when the test says so. */
function answeringInParts() {
  let stream!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (controller) => void (stream = controller) })
  const encoder = new TextEncoder()
  return {
    send: async (_url: string, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => stream.error(init.signal?.reason))
      return new Response(body, { status: 200 })
    },
    part: (text: string) => stream.enqueue(encoder.encode(text)),
    end: () => stream.close(),
  }
}

/** What the read came to so far: its answer, the error it failed with, or `waiting`. */
function watch<T>(read: Promise<T>) {
  let now: T | Error | 'waiting' = 'waiting'
  read.then(
    (answer) => (now = answer),
    (error: Error) => (now = error),
  )
  return () => now
}

describe('a relay read that goes silent', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('ends a query the relay never answers, and the report would say not reached', async () => {
    const read = watch(answerWithin(QUERY, asked, silent))
    await vi.advanceTimersByTimeAsync(READ_SILENCE_MS - 1)
    expect(read()).toBe('waiting')
    await vi.advanceTimersByTimeAsync(1)
    expect((read() as Error).name).toBe('TimeoutError')
    expect(failureReasonOf(read())).toBe('not-reached')
  })

  it('ends the relay’s information read the same way', async () => {
    const read = watch(answerWithin('https://relay.example', { method: 'GET' }, silent))
    await vi.advanceTimersByTimeAsync(READ_SILENCE_MS)
    expect((read() as Error).name).toBe('TimeoutError')
  })

  it('reads a long answer whole while it keeps arriving, however long it takes', async () => {
    const relay = answeringInParts()
    const read = watch(answerWithin(QUERY, asked, relay.send))
    for (const part of ['[{"id":', '"a"},', '{"id":"b"}', ']']) {
      await vi.advanceTimersByTimeAsync(READ_SILENCE_MS - 5_000)
      relay.part(part)
    }
    await vi.advanceTimersByTimeAsync(READ_SILENCE_MS - 5_000)
    expect(read()).toBe('waiting')
    relay.end()
    await vi.advanceTimersByTimeAsync(0)
    expect(read()).toEqual({ status: 200, body: '[{"id":"a"},{"id":"b"}]' })
  })

  it('ends an answer that stops arriving partway, counted from its last part', async () => {
    const relay = answeringInParts()
    const read = watch(answerWithin(QUERY, asked, relay.send))
    await vi.advanceTimersByTimeAsync(15_000)
    relay.part('[{"id":')
    await vi.advanceTimersByTimeAsync(READ_SILENCE_MS - 1)
    expect(read()).toBe('waiting')
    await vi.advanceTimersByTimeAsync(1)
    expect((read() as Error).name).toBe('TimeoutError')
  })

  it('leaves a write the relay never answers waiting, since it may have landed', async () => {
    const write = watch(answerWithin('https://relay.example/events', { method: 'POST', body: '{}' }, silent))
    await vi.advanceTimersByTimeAsync(READ_SILENCE_MS * 3)
    expect(write()).toBe('waiting')
  })

  it('ends at once, for the caller’s reason, when the caller ends it', async () => {
    const caller = new AbortController()
    const read = watch(answerWithin(QUERY, { ...asked, signal: caller.signal }, silent))
    caller.abort(new DOMException('the page left', 'AbortError'))
    await vi.advanceTimersByTimeAsync(0)
    expect((read() as Error).name).toBe('AbortError')
  })
})
