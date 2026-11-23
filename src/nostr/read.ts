/**
 * A workspace's events, read into what Ship's pages show: its projects and
 * issues, the changes that made them what they are, and the conversations
 * about them.
 *
 * Every part is a shared read (MOV-4): the projects and issues and their
 * changes are `@estiva-app/interop`'s `projectEvents` through Ship's manifest
 * (`files.ts`), and the conversations are `@estiva-app/conversation`'s
 * `foldThreads` (`conversations.ts`). Ship has no read of its own left to
 * disagree with Peek, Leaf and the agent.
 *
 * Pure over already-fetched events — no relay, no clock.
 */
import type { SignedEvent } from '@estiva-app/protocol'
import { conversationsOf, parseMessage, type Conversation, type Message } from './conversations'
import { activityOf, readFiles, type Change, type Issue, type Project } from './files'

/** The whole readable state of a workspace, or of the teams read. */
export interface FolderState {
  projects: Project[]
  issues: Issue[]
  /** Every change the shared read counted toward these projects and issues, file by file, each file's oldest first. */
  activity: Change[]
  /** Conversations in these teams, most recently active first. */
  conversations: Conversation[]
}

/**
 * Read a set of events, everything the relay returned for the teams asked, in
 * one pass rather than a query per file.
 */
export function readState(
  events: readonly SignedEvent[],
  /**
   * How to turn `nostr:naddr…` in a message body into addresses. Injected so
   * this stays free of bech32; `store.ts` supplies the real decoder, and a
   * caller that does not care can omit it.
   */
  resolveRefs: (body: string) => string[] = () => [],
): FolderState {
  const { projects, issues, files } = readFiles(events)
  const messages: Message[] = []
  for (const event of events) {
    const message = parseMessage(event, resolveRefs)
    if (message) messages.push(message)
  }
  return { projects, issues, activity: activityOf(files), conversations: conversationsOf(messages) }
}
