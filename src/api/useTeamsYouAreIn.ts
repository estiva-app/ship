import { useEffect, useState } from 'react'
import { readTeamsYouAreIn } from './foreign'
import { signer } from './store'

/** The last answer and the teams it was for: the sidebar drawn again for the same teams does not wait for a read. */
let held: { key: string; value: ReadonlySet<string> } | undefined

/**
 * Which of these teams the viewer is in, for the sidebar's Other teams (Katerina, 23 November, as Peek's Teams column):
 * read once per set of teams. `undefined` until read, and when the read failed, so the sidebar lists every team in one
 * list, as before, rather than guess who is in what.
 */
export function useTeamsYouAreIn(teams: readonly string[] | undefined): ReadonlySet<string> | undefined {
  const key = teams ? [...teams].sort().join(' ') : undefined
  const [answer, setAnswer] = useState<{ key: string; value: ReadonlySet<string> } | undefined>(() => (held && held.key === key ? held : undefined))
  useEffect(() => {
    if (key === undefined) return
    // The teams are asked about by their key: a new array of the same teams is not a new question.
    const ids = key ? key.split(' ') : []
    let live = true
    readTeamsYouAreIn(ids, signer.pubkey)
      .then((value) => {
        held = { key, value }
        if (live) setAnswer(held)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [key])
  return answer && answer.key === key ? answer.value : held && held.key === key ? held.value : undefined
}
