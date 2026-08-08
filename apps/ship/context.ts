/**
 * What every view is handed.
 *
 * A plain object rather than imports from `app.ts`, so views depend on the
 * shell's *shape* and not on its module — otherwise every view imports the
 * shell and the shell imports every view, and the bundler resolves the cycle by
 * handing somebody an undefined at load time.
 */
import type { Signer } from '../../lib/nostr/signer'
import type { FolderState, Issue, Project } from '../../src/fold'
import type { Profile } from '../../src/profiles'
import type { Store } from '../../src/store'
import type { Route } from './router'

export interface Ctx {
  store: Store
  /**
   * Who is acting, and how they sign.
   *
   * Views only ever read `pubkey` — how a signature is produced is the data
   * layer's problem (PEEK-44). Handing views the signer rather than a key means
   * a signed-in person and an anonymous one look identical from here.
   */
  signer: Signer
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
  /** "you", a name from `kind:0`, or a truncated pubkey — in that order. */
  who(pubkey: string): string
  /** A name from `kind:0`, or a truncated pubkey. Never "you". */
  nameOf(pubkey: string): string
  /** The `kind:0` profile behind a pubkey, when the relay had one. */
  profile(pubkey: string): Profile | undefined
  /** The Folder an issue's events must carry — the one it already lives in. */
  folderOf(issue: Issue): string
  /** Where a new issue in this project belongs. */
  folderForProject(project: Project): string
}
