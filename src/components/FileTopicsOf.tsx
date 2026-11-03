import { readTopicChoices } from '@/api/topics'
import type { FileTopicsOfFile } from '@/api/useFileTopics'
import { FileTopics } from './FileTopics'
import { act, type Say } from '@/pages/act'

/**
 * The rail's Topics for the issue or project page (TOP-5): its topics read and
 * changed by the file's id, a refusal said as every other write's is. No
 * workspace re-read: a topic's list is not in Ship's fold. The page holds the
 * read (`useFileTopics`), so its Related leaves out a topic already named here.
 */
export function FileTopicsOf({ topics, say }: { topics: FileTopicsOfFile; say: Say }) {
  const { state, busy, setListed } = topics
  return (
    <FileTopics
      topics={state}
      busy={busy}
      onChange={(topic, listed) => void act(listed ? `Add to ${topic.title}` : `Remove from ${topic.title}`, () => setListed(topic, listed), say)}
      readChoices={readTopicChoices}
    />
  )
}
