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
 * Every topic the reader can read, read once per tab (SHIPS-2) — interop's
 * `readTopics`, held as the Folder listing is (`useFolders`), so Add to topic,
 * the Topics page and a topic's page draw from one copy. A failed read is read
 * again on the platform's backoff and never replaces a good one.
 *
 * Read again after this tab adds a file to a topic or takes one off; another
 * person's change is picked up on reload.
 */
const held = createRetryingRead<TopicsRead>()

/** Every topic, read now if this tab has not yet; rejects while there is none to give. */
async function topicsNow(): Promise<TopicsRead> {
  await held.ensure(readAllTopics)
  const { value, error } = held.snapshot()
  if (value) return value
  throw error ?? new Error('Topics could not be read.')
}

/** Test seam: forget the held topics and choices. */
export function resetTopicsForTests(): void {
  held.clear()
  choices = undefined
}

/** Read every topic again, keeping the held answer on screen until it lands; nothing when none is held yet. */
export function reloadTopics(): Promise<void> {
  return held.snapshot().value ? held.reload(readAllTopics) : Promise.resolve()
}

/** Every topic the reader can read; `undefined` until the first read lands. */
export function useTopics(): TopicsRead | undefined {
  const snapshot = useSyncExternalStore(held.subscribe, held.snapshot)
  useEffect(() => void held.ensure(readAllTopics), [])
  return snapshot.value
}

/** Add to topic's choices: the topics you are a member of, then the rest. */
export interface TopicChoices {
  yours: TopicOfFile[]
  others: TopicOfFile[]
}

const drawn = (topic: ReadTopic) => topicAsDrawn(topic.address, topic.folder, topic.object)

/** The last choices, so Add to topic opened again draws the same object at once. */
let choices: { read: TopicsRead; folders: FolderSummary[]; value: TopicChoices } | undefined

function choicesOf(read: TopicsRead, folders: FolderSummary[]): TopicChoices {
  if (choices?.read === read && choices.folders === folders) return choices.value
  const { yours, others } = addableTopics(read, new Set(folders.map((folder) => folder.id)))
  const value = { yours: yours.map(drawn), others: others.map(drawn) }
  choices = { read, folders, value }
  return value
}

/**
 * What Add to topic offers (TOP-5, SHIPS-2): the open topics in a Folder the
 * relay lists for you — where it accepts your entry — yours first, then the
 * rest, each A–Z; none archived, by itself or with its project. At once when
 * this tab has read the topics and the Folders, else once they are read.
 */
export function readTopicChoices(): TopicChoices | Promise<TopicChoices> {
  const read = held.snapshot().value
  const folders = heldFolders()
  if (read && folders) return choicesOf(read, folders)
  return Promise.all([topicsNow(), foldersNow()]).then(([read, folders]) => choicesOf(read, folders))
}

/**
 * Each topic's conversations in Peek and whether Peek shows you its dot
 * (SHIPS-2), for the Topics page to draw. `undefined` until the topics, your
 * read state and your mute list are all in hand: a dot judged without them
 * would light topics you have read or muted. Read again when one of them moves.
 */
export function useTopicConversations(): Map<string, TopicConversation> | undefined {
  const read = useTopics()
  const merged = useLandedReadState()
  const [muted, setMuted] = useState<ReadonlySet<string>>()
  const [conversations, setConversations] = useState<Map<string, TopicConversation>>()

  useEffect(() => {
    let live = true
    void readMuted((filters) => relay.query(filters as never), (ciphertext) => nip44.decrypt(ciphertext), signer.pubkey)
      .then((keys) => live && keys && setMuted(keys))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

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
