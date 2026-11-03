import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRetryingRead } from '@estiva-app/platform'
import { addableTopics, type ReadTopic, type TopicConversation, type TopicsRead } from '@estiva-app/interop'
import { readAllTopics, readTopicConversations, topicAsDrawn, type FolderSummary, type TopicOfFile } from './foreign'
import { foldersNow, heldFolders } from './useFolders'
import { useLandedReadState } from './readStateSync'
import { readMuted } from './useFeedJudges'
import { nip44 } from './nip44'
import { relay, signer } from './store'

/**
 * Every topic the reader can read, held per tab (SHIPS-2) — interop's
 * `readTopics`, held as the Folder listing is (`useFolders`), so Add to topic
 * opened again draws at once while it reads again, and opens filled once the
 * Topics page has read them (SHIPS-3). Not retried on its own: the next open
 * reads, or Try again, and a failed read never replaces a good one.
 */
const held = createRetryingRead<TopicsRead>({ retryable: () => false })

/** Every topic, read now or joining a read on the way; rejects while there is none to give. */
async function topicsFresh(): Promise<TopicsRead> {
  await held.reload(readAllTopics)
  const { value, error } = held.snapshot()
  if (value) return value
  throw error ?? new Error('Topics could not be read.')
}

/** Test seam: forget the held topics and choices. */
export function resetTopicsForTests(): void {
  held.clear()
  choices = undefined
}

/** The Topics page's read: `undefined` while the first one is out, `failed` when it did not land. */
export type TopicsState = TopicsRead | 'failed' | undefined

/** Start reading the topics, for a route that will draw them before the page mounts; joins a read on the way. */
export function prefetchTopics(): void {
  void held.ensure(readAllTopics)
}

/**
 * Every topic the reader can read, for the Topics page (SHIPS-3): the held
 * answer at once, read afresh on each open as Add to topic is, so a topic
 * started since shows. `failed` only once this open's read has failed: an
 * error left by an earlier read is not this one's.
 */
export function useTopics(): TopicsState {
  const snapshot = useSyncExternalStore(held.subscribe, held.snapshot)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    let live = true
    void (held.snapshot().value ? held.reload(readAllTopics) : held.ensure(readAllTopics)).finally(() => live && setSettled(true))
    return () => {
      live = false
    }
  }, [])
  return snapshot.value ?? (settled && snapshot.error !== undefined ? 'failed' : undefined)
}

/** Try again after a failed read: read every topic now. */
export function reloadTopics(): Promise<void> {
  return held.reload(readAllTopics)
}

/**
 * Each topic's conversations in Peek and how many are new for you (SHIPS-3),
 * for the Topics page to draw. `undefined` until the topics, your read state
 * and your mute list are all in hand: a dot judged without them would light
 * topics you have read or muted. Read again when one of them moves.
 */
export function useTopicConversations(read: TopicsRead | undefined): Map<string, TopicConversation> | undefined {
  const merged = useLandedReadState()
  const [muted, setMuted] = useState<ReadonlySet<string>>()
  const [conversations, setConversations] = useState<Map<string, TopicConversation>>()

  // Asked again when the read state moves while the list would not decrypt (a busy nip44), rather than never.
  useEffect(() => {
    if (muted) return
    let live = true
    void readMuted((filters) => relay.query(filters as never), (ciphertext) => nip44.decrypt(ciphertext), signer.pubkey)
      .then((keys) => live && keys && setMuted(keys))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [muted, merged])

  useEffect(() => {
    if (!read || !merged || !muted) return
    let live = true
    readTopicConversations(read, { merged, muted })
      .then((next) => live && setConversations(next))
      // A failed re-read keeps the counts already drawn.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [read, merged, muted])

  return conversations
}

/** Add to topic's choices: the topics you are a member of, then the rest. */
export interface TopicChoices {
  yours: TopicOfFile[]
  others: TopicOfFile[]
}

const drawn = (topic: ReadTopic) => topicAsDrawn(topic.address, topic.folder, topic.object)

/** The last choices, so an unchanged read draws the same object. */
let choices: { read: TopicsRead; folders: FolderSummary[]; value: TopicChoices } | undefined

function choicesOf(read: TopicsRead, folders: FolderSummary[]): TopicChoices {
  if (choices?.read === read && choices.folders === folders) return choices.value
  const { yours, others } = addableTopics(read, new Set(folders.map((folder) => folder.id)))
  const value = { yours: yours.map(drawn), others: others.map(drawn) }
  choices = { read, folders, value }
  return value
}

/** Add to topic's choices from what this tab holds, for the palette to draw at once; `undefined` before the first read. */
export function topicChoicesNow(): TopicChoices | undefined {
  const read = held.snapshot().value
  const folders = heldFolders()
  return read && folders ? choicesOf(read, folders) : undefined
}

/**
 * What Add to topic offers (TOP-5, SHIPS-2): the open topics in a Folder the
 * relay lists for you — where it accepts your entry — yours first, then the
 * rest, each A–Z; none archived, by itself or with its project. Read afresh
 * on each open, so a topic made or archived since shows; the palette draws
 * {@link topicChoicesNow} until this lands.
 */
export async function readTopicChoices(): Promise<TopicChoices> {
  const [read, folders] = await Promise.all([topicsFresh(), foldersNow()])
  return choicesOf(read, folders)
}
