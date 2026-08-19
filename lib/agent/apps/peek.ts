/**
 * Peek, as an agent reads it.
 *
 * The second app module, and the one that tests whether the seam in `../cli.ts`
 * was drawn in the right place. It was, for the part that mattered: **nothing
 * about access needed redoing.** The same service credential, the same NIP-98
 * prefix, the same admitted pubkey. The identity is admitted to the *relay*,
 * not to an app, so a second app costs no second identity.
 *
 * ## What Peek writes
 *
 * `kind:9007` creates a channel — the Folder a topic *is*. `kind:9` is a
 * message in one, `kind:9101` an assertion *about* a thread rather than a
 * message in it.
 *
 * ## The overlap with Ship is real, not a resemblance
 *
 * Ship reads `kind:9` for its own project conversations because it is the same
 * event Peek writes for a topic message — one wire format read twice, which is
 * the ecosystem's central claim made concrete. So this module folds
 * conversations with Ship's `foldFolder` rather than parsing them again.
 *
 * **That import is the one thing here worth revisiting.** Conversation folding
 * is protocol-level (NIP-29 stream messages), not Ship-level, and it currently
 * lives in `src/fold.ts` because Ship needed it first. Two consumers is
 * tolerable; a third should move it to `lib/nostr/`. Reimplementing it here
 * would be worse than the coupling — two parsers for one wire format drift, and
 * the drift shows up as two apps disagreeing about what somebody said.
 *
 * ## Folders are shared, and `channel_type` says who made them
 *
 * Every app on this relay creates Folders in one space. Measured on prod: 40
 * channels, of which the `forum` ones are Ship projects (named `project-<uuid>`)
 * and the `stream` ones are Peek topics. So `topics` shows streams by default —
 * listing a caller's Ship projects back at them under "topics" would be
 * accurate about the data and wrong about the question.
 */
import { foldFolder } from '../../../src/fold'
import type { SignedEvent } from '../../nostr/events'
import { BadRequest, flagValue, type AgentApp, type AgentContext } from '../cli'
import { resolveOne } from '../resolve'
import { Store } from '../../../src/store'
import type { Directory } from '../../../src/profiles'

/** Peek's kinds. The only place in the agent tooling that names them. */
const KIND = {
  MESSAGE: 9,
  CHANNEL: 9007,
  /** "This thread is resolved" — said on the wire, not inferred. */
  ASSERTION: 9101,
} as const

const tagValue = (event: SignedEvent, name: string) =>
  event.tags.find((tag) => tag[0] === name)?.[1]

export interface Topic {
  folder: string
  name: string
  about?: string
  visibility?: string
  /** `stream` is a Peek topic; `forum` is a Ship project's Folder. */
  type?: string
  createdBy: string
  createdAt: number
}

function parseTopic(event: SignedEvent): Topic | null {
  const folder = tagValue(event, 'h')
  const name = tagValue(event, 'name')
  if (!folder || !name) return null
  return {
    folder,
    name,
    about: tagValue(event, 'about'),
    visibility: tagValue(event, 'visibility'),
    type: tagValue(event, 'channel_type'),
    createdBy: event.pubkey,
    createdAt: event.created_at,
  }
}

async function loadTopics(context: AgentContext): Promise<Topic[]> {
  const events = await context.relay.query([{ kinds: [KIND.CHANNEL], limit: 500 }])
  const topics: Topic[] = []
  for (const event of events) {
    const topic = parseTopic(event)
    if (topic) topics.push(topic)
  }
  return topics
}

function who(directory: Directory, pubkey: string): string {
  return directory.get(pubkey)?.name ?? `${pubkey.slice(0, 8)}…`
}

/**
 * One topic from a name, a fragment, or a Folder id.
 *
 * Refuses ambiguity rather than guessing, for the same reason the Ship module
 * does: an agent that silently picks one of two matching topics reports on the
 * wrong conversation, and nothing afterwards reveals it did.
 */
export function findTopic(topics: Topic[], reference: string): Topic {
  return resolveOne(topics, reference, {
    noun: 'topic',
    exact: (topic) => [topic.folder, topic.name],
    text: (topic) => topic.name,
    label: (topic) => `${topic.folder.slice(0, 8)} — ${topic.name}`,
    hint: 'Pass a topic name or a folder id.',
  })
}

export const peekApp: AgentApp = {
  name: 'peek',
  summary: 'topics and conversations in Peek',
  commands: [
    {
      name: 'topics',
      summary: 'Peek topics, busiest first',
      usage: 'topics [--all]',
      async run(context, args) {
        const topics = await loadTopics(context)

        // One query for every message, counted per Folder. A query per topic
        // would be 40 round trips for one list.
        const messages = await context.relay.query([{ kinds: [KIND.MESSAGE], limit: 2000 }])
        const counts = new Map<string, number>()
        for (const message of messages) {
          const folder = tagValue(message, 'h')
          if (folder) counts.set(folder, (counts.get(folder) ?? 0) + 1)
        }

        const wanted = args.flags.all ? topics : topics.filter((topic) => topic.type !== 'forum')

        return wanted
          .map((topic) => ({
            folder: topic.folder,
            name: topic.name,
            type: topic.type,
            about: topic.about,
            messages: counts.get(topic.folder) ?? 0,
          }))
          .sort((a, b) => b.messages - a.messages)
      },
    },
    {
      name: 'topic',
      summary: 'one topic, with its conversations',
      usage: 'topic <name|folder> [--limit <n>]',
      async run(context, args) {
        const reference = args.positional[0]
        if (!reference) throw new BadRequest('topic needs a name — try `peek topics` first.')

        const topic = findTopic(await loadTopics(context), reference)
        const limitFlag = flagValue(args, 'limit')
        const limit = limitFlag ? Number(limitFlag) : 200
        if (!Number.isFinite(limit) || limit <= 0) throw new BadRequest('--limit must be a number')

        const events = await context.relay.query([
          { kinds: [KIND.MESSAGE, KIND.ASSERTION], '#h': [topic.folder], limit },
        ])

        /*
          Ship's fold, on Peek's events, deliberately — see the note at the top.
          A `kind:9` in a topic and a `kind:9` on a project are the same event,
          and threading them twice is how two apps end up disagreeing about a
          conversation they can both see.
        */
        const { conversations } = foldFolder(events)

        const speakers = conversations.flatMap((thread) => [
          thread.root.author,
          ...thread.replies.map((reply) => reply.author),
        ])
        const directory = speakers.length
          ? await new Store(context.relay, context.signer).profiles([...new Set(speakers)])
          : (new Map() as Directory)

        const resolved = new Set(
          events
            .filter((event) => event.kind === KIND.ASSERTION)
            .map((event) => tagValue(event, 'e'))
            .filter(Boolean) as string[],
        )

        return {
          folder: topic.folder,
          name: topic.name,
          about: topic.about,
          conversations: conversations.map((thread) => ({
            id: thread.id,
            // Said on the wire by a kind:9101, never inferred from the text.
            resolved: resolved.has(thread.id) || undefined,
            messages: [thread.root, ...thread.replies].map((message) => ({
              by: who(directory, message.author),
              at: new Date(message.ts ?? message.createdAt * 1000).toISOString(),
              body: message.body,
            })),
          })),
        }
      },
    },
  ],
}
