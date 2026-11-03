import { useCallback, useEffect, useRef, useState } from 'react'
import { readFileTopics, type TopicOfFile } from './foreign'
import { setListedInTopic, type WriteResult } from './writes'

/** The topics that list a file: `undefined` while the first read runs, `'failed'` when it could not be read. */
export type FileTopicsState = TopicOfFile[] | 'failed' | undefined

/** A file's topics as {@link useFileTopics} holds them. */
export interface FileTopicsOfFile {
  state: FileTopicsState
  /** Topic addresses with a write on the way. */
  busy: ReadonlySet<string>
  setListed: (topic: TopicOfFile, listed: boolean) => Promise<WriteResult>
}

/**
 * A Ship project's or issue's topics (TOP-5), and Add to topic and Remove.
 *
 * Read once per file and again after each write: the project says "after a
 * reload", so no live watch. A write shows at once and rolls back when the
 * relay refuses it, with the relay's reason for the caller to say.
 */
export function useFileTopics(file: string | undefined): FileTopicsOfFile {
  const [state, setState] = useState<FileTopicsState>(undefined)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [nonce, setNonce] = useState(0)
  /** Writes on their way: a read landing meanwhile is not drawn. */
  const writing = useRef(0)

  useEffect(() => {
    setState(undefined)
  }, [file])

  useEffect(() => {
    if (!file) return
    let live = true
    readFileTopics(file)
      // A read that started before a write still on its way would draw the list without it: the write's own re-read follows.
      .then((topics) => live && writing.current === 0 && setState(topics))
      // A failed re-read keeps what was read; only a failed first read says so.
      .catch(() => live && setState((held) => (held === undefined ? 'failed' : held)))
    return () => {
      live = false
    }
  }, [file, nonce])

  const setListed = useCallback(
    async (topic: TopicOfFile, listed: boolean): Promise<WriteResult> => {
      if (!file) return { ok: false, reason: 'Nothing to add.' }
      const mark = (on: boolean) =>
        setBusy((held) => {
          const next = new Set(held)
          if (on) next.add(topic.address)
          else next.delete(topic.address)
          return next
        })
      const apply = (put: boolean) =>
        setState((held) => {
          if (!Array.isArray(held)) return held
          const without = held.filter((t) => t.address !== topic.address)
          return put ? [...without, topic].sort((a, b) => a.title.localeCompare(b.title)) : without
        })
      mark(true)
      writing.current += 1
      apply(listed)
      const result = await setListedInTopic(topic, file, listed).finally(() => (writing.current -= 1))
      if (!result.ok) apply(!listed)
      mark(false)
      setNonce((n) => n + 1)
      return result
    },
    [file],
  )

  return { state, busy, setListed }
}
