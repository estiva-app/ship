import { createRetryingRead } from '@estiva-app/platform'
import { addableTopics, type ReadTopic, type TopicsRead } from '@estiva-app/interop'
import { readAllTopics, topicAsDrawn, type FolderSummary, type TopicOfFile } from './foreign'
import { foldersNow, heldFolders } from './useFolders'

/**
 * Every topic the reader can read, held per tab (SHIPS-2) — interop's
 * `readTopics`, held as the Folder listing is (`useFolders`), so Add to topic
 * opened again draws at once while it reads again. Not retried on its own:
 * the next open reads, and a failed read never replaces a good one.
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
