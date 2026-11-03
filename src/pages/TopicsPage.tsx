import { useMemo, useState } from 'react'
import type { FolderSummary } from '@estiva-app/interop'
import type { FolderState } from '@/api'
import { reloadTopics, useTopicConversations, useTopics } from '@/api/topics'
import type { Archives } from '@/lib/archive'
import { topicsByTab, type TopicsTab } from '@/lib/topics'
import { TopicsView } from '@/views/TopicsView'

/**
 * Ship's Topics (SHIPS-3): every topic that lists a project or issue, from the
 * one topics read Add to topic draws from, opening on Your topics. `folder`
 * keeps only the topics filed in that Folder (record
 * a-topic-lives-in-exactly-one-team), reached by its URL until the new sidebar
 * names it (SHIPS-5).
 */
export function TopicsPage({ state, archives, folders, folder }: { state: FolderState; archives: Archives; folders: FolderSummary[] | undefined; folder?: string }) {
  const [tab, setTab] = useState<TopicsTab>('yours')
  const read = useTopics()
  const held = read === 'failed' ? undefined : read
  const conversations = useTopicConversations(held)
  const lists = useMemo(
    () => (held ? topicsByTab(held, { projects: state.projects, issues: state.issues, archives }, conversations, folder) : undefined),
    [held, state.projects, state.issues, archives, conversations, folder],
  )
  const folderName = folder ? (folders?.find((summary) => summary.id === folder)?.name ?? 'Folder') : undefined
  return (
    <TopicsView
      title={folderName ? `${folderName} · Topics` : 'Topics'}
      lists={lists ?? (read === 'failed' ? 'failed' : 'loading')}
      tab={tab}
      onTab={setTab}
      onRetry={() => void reloadTopics()}
    />
  )
}
