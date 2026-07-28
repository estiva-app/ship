/**
 * What every view is handed.
 *
 * A plain object rather than imports from `app.ts`, so views depend on the
 * shell's *shape* and not on its module — otherwise every view imports the
 * shell and the shell imports every view, and the bundler resolves the cycle by
 * handing somebody an undefined at load time.
 */
import type { Identity } from '../../lib/nostr/relay'
import type { FolderState, Issue, Project } from '../../src/fold'
import type { Store } from '../../src/store'
import type { Route } from './router'

export interface Ctx {
  store: Store
  identity: Identity
  /** Every project this identity can see, and everything in them, folded. */
  state: FolderState
  route: Route
  /** Pubkeys seen acting anywhere visible — the assignee picker's options. */
  people: string[]
  /** Show a transient banner. */
  say(message: string, kind?: 'ok' | 'error'): void
  /** Publish, surface a rejection, and report whether it landed. */
  publish(what: string, action: () => Promise<{ ok: boolean; reason?: string }>): Promise<boolean>
  /** Re-read from the relay and re-render. */
  reload(): Promise<void>
  /** True when the pubkey is the local identity. */
  isMe(pubkey: string): boolean
  /** "you" or a truncated pubkey. */
  who(pubkey: string): string
  /** The Folder an issue's events must carry — the one it already lives in. */
  folderOf(issue: Issue): string
  /** Where a new issue in this project belongs. */
  folderForProject(project: Project): string
}
