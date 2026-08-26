import type { WriteResult } from '@/api'

export type Say = (text: string, tone?: 'ok' | 'error') => void

/**
 * Every write the pages make goes through here — the old app's `publish`:
 * a refusal is said with its reason ("<what> rejected — …"), and a success
 * is followed by a re-read of the workspace, so what the page shows next is
 * what the relay holds, never what the UI hoped. Resolves whether it worked,
 * which is what an editable field or a dialog needs to know.
 */
export async function act(what: string, write: () => Promise<WriteResult>, say: Say, refresh: () => Promise<void>): Promise<boolean> {
  const result = await write()
  if (!result.ok) {
    say(`${what} rejected — ${result.reason}`, 'error')
    return false
  }
  await refresh()
  return true
}
