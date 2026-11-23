/**
 * A relay read that is never answered ends, instead of leaving its page on
 * "loading" for good (SHI-68). Forced on production, a `/query` that never
 * answered left Topics with its heading and nothing else: no "didn't load", no
 * Try again and no report, where every other failure says so. A read the
 * relay has sent nothing for in {@link READ_SILENCE_MS} fails as a
 * `TimeoutError`, which the report names "not reached", and the page says it
 * did not load.
 *
 * The clock counts silence, not the whole read: it starts again with every
 * part of the answer that arrives, so a long answer on a slow connection is
 * never cut while it is still coming.
 *
 * Reads only: a write cut here may still have landed, and saying "Not saved"
 * for one that did is worse than waiting.
 */

/** How long the relay may send nothing for a read: before its answer starts, and between its parts. */
export const READ_SILENCE_MS = 20_000

/** A query, or the relay's information document (a GET): nothing is written by either. */
const isRead = (url: string, init: RequestInit | undefined): boolean =>
  (init?.method ?? 'GET').toUpperCase() === 'GET' || /\/query$/.test(url.split(/[?#]/)[0] ?? '')

/** The answer's text, calling `arrived` as each part of it lands. */
async function textOf(response: Response, arrived: () => void): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return response.text()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return text + decoder.decode()
    arrived()
    text += decoder.decode(value, { stream: true })
  }
}

/**
 * Sends the request and reads its answer whole. A read ends with a
 * `TimeoutError` once the relay has sent nothing for `ms`; a signal the caller
 * gave still ends it too. A write is sent and read as it always was.
 */
export async function answerWithin(
  url: string,
  init: RequestInit | undefined,
  send: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  ms = READ_SILENCE_MS,
): Promise<{ status: number; body: string }> {
  if (!isRead(url, init)) {
    const response = await send(url, init)
    return { status: response.status, body: await response.text() }
  }
  const clock = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const heard = () => {
    clearTimeout(timer)
    // A plain Error by name: a DOMException is not an `Error` in every realm, and the report reads the name off one.
    timer = setTimeout(() => clock.abort(Object.assign(new Error('it did not answer in time'), { name: 'TimeoutError' })), ms)
  }
  const given = init?.signal
  const end = () => clock.abort(given?.reason)
  if (given?.aborted) end()
  else given?.addEventListener('abort', end, { once: true })
  heard()
  try {
    const response = await send(url, { ...init, signal: clock.signal })
    heard()
    return { status: response.status, body: await textOf(response, heard) }
  } finally {
    clearTimeout(timer)
    given?.removeEventListener('abort', end)
  }
}
