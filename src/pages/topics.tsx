import { readTopicChoices } from '@/api/foreign'
import { useFileTopics } from '@/api/useFileTopics'
import { FileTopics } from '@/components/FileTopics'
import { act, type Say } from './act'

/**
 * The rail's Topics for the issue or project page (TOP-5): its topics read and
 * changed by the file's id, a refusal said as every other write's is. No
 * workspace re-read: a topic's list is not in Ship's fold.
 */
export function FileTopicsOf({ file, say }: { file: string; say: Say }) {
  const { state, busy, setListed } = useFileTopics(file)
  return (
    <FileTopics
      topics={state}
      busy={busy}
      onChange={(topic, listed) => void act(listed ? `Add to ${topic.title}` : `Remove from ${topic.title}`, () => setListed(topic, listed), say)}
      readChoices={readTopicChoices}
    />
  )
}
