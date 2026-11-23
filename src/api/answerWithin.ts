/**
 * A relay read that is never answered ends, instead of leaving its page on
 * "loading" for good (SHI-68). Forced on production, a `/query` that never
 * answered left Topics with its heading and nothing else, no "didn't load", no
 * Try again and no report, where every other failure says so. Past
 * {@link READ_ANSWER_MS} the read fails as a `TimeoutError`, which the report
 * names "not reached", and the page says it did not load.
 *
 * Reads only: a write cut here may still have landed, and saying "Not saved"
 * for one that did is worse than waiting.
 */

/** How long a read may go unanswered, body included. A cold open's widest read answers in under 3 s as Miky. */
export const READ_ANSWER_MS = 20_000

const isRead = (url: string): boolean => /\/query$/.test(url.split(/[?#]/)[0] ?? '')

/**
 * Runs `ask` with a signal that ends it `ms` after it started, when `url` is a
 * read; a signal the caller gave still ends it too. The clock stops when `ask`
 * settles, so it must read the body before it does.
 */
export async function answerWithin<T>(
  url: string,
  init: RequestInit | undefined,
  ask: (init: RequestInit | undefined) => Promise<T>,
  ms = READ_ANSWER_MS,
): Promise<T> {
  if (!isRead(url)) return ask(init)
  const clock = new AbortController()
  const timer = setTimeout(() => clock.abort(new DOMException('The relay did not answer in time.', 'TimeoutError')), ms)
  const given = init?.signal
  const end = () => clock.abort(given?.reason)
  if (given?.aborted) end()
  else given?.addEventListener('abort', end, { once: true })
  try {
    return await ask({ ...init, signal: clock.signal })
  } finally {
    clearTimeout(timer)
    given?.removeEventListener('abort', end)
  }
}
