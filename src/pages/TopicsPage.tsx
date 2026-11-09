import { useMemo, useState } from 'react'
import type { FolderSummary } from '@estiva-app/interop'
import type { Say } from '@/pages/act'
import { reloadTopics, useMuted, useTopicActivity, useTopicMembers, useTopics } from '@/api/topics'
import { joinTopic } from '@/api/writes'
import { topicsByTab, yourTopics, type TopicRowData, type TopicsTab } from '@/lib/topics'
import { TopicsView } from '@/views/TopicsView'

/**
 * Ship's Topics, which the sidebar's Explore topics opens (TOPI-9): every
 * topic you can open, from the one topics read Add to topic draws from,
 * opening on Your topics, newest first as the sidebar orders them. `folder`
 * keeps only the topics filed in that Folder (record
 * a-topic-lives-in-exactly-one-team).
 *
 * Your topics' order waits for their activity, read once with the sidebar's;
 * a tab's Members and Active are read when it is shown, so a cold open reads
 * no other topic's (the kickoff's load cost). A topic you join here stays
 * where it is, Join gone and one more member, and moves to Your topics and
 * into the sidebar's five on the next open (Miky, 6 Nov).
 */
export function TopicsPage({ folders, folder, say }: { folders: FolderSummary[] | undefined; folder?: string; say: Say }) {
  const [tab, setTab] = useState<TopicsTab>('yours')
  const [joining, setJoining] = useState<ReadonlySet<string>>(new Set())
  const [joined, setJoined] = useState<ReadonlySet<string>>(new Set())
  const read = useTopics()
  const held = read === 'failed' ? undefined : read
  const muted = useMuted()
  const yours = useMemo(() => (held ? yourTopics(held, muted) : undefined), [held, muted])
  const order = useTopicActivity(held, yours)
  const teamName = useMemo(() => {
    const names = new Map((folders ?? []).map((summary) => [summary.id, summary.name ?? 'Untitled team']))
    return (id: string) => names.get(id)
  }, [folders])
  // Which topics the shown tab draws: theirs are the Members and Active read.
  const shownTab = useMemo(() => (held ? topicsByTab(held, {}, folder, muted)[tab].map((row) => row.address) : undefined), [held, folder, muted, tab])
  const active = useTopicActivity(held, shownTab)
  const members = useTopicMembers(held, shownTab)
  const lists = useMemo(() => {
    if (!held || (!order.values && !order.failed)) return undefined
    const drawn = topicsByTab(held, { at: active.values ?? order.values, members: members.values, teamName }, folder, muted)
    if (joined.size === 0) return drawn
    const withJoined = (row: TopicRowData): TopicRowData => (joined.has(row.address) && !row.yours ? { ...row, yours: true, ...(row.members !== undefined ? { members: row.members + 1 } : {}) } : row)
    return Object.fromEntries(Object.entries(drawn).map(([id, rows]) => [id, rows.map(withJoined)])) as typeof drawn
  }, [held, order.values, order.failed, active.values, members.values, teamName, folder, muted, joined])
  const folderName = folder ? (folders?.find((summary) => summary.id === folder)?.name ?? 'Untitled team') : undefined

  const onJoin = async (address: string) => {
    const topic = held?.topics.find((candidate) => candidate.address === address)
    if (!topic || joining.has(address)) return
    setJoining((now) => new Set(now).add(address))
    const result = await joinTopic(topic)
    setJoining((now) => {
      const next = new Set(now)
      next.delete(address)
      return next
    })
    if (result.ok) setJoined((now) => new Set(now).add(address))
    else say(`Not joined — ${result.reason}`, 'error')
  }

  return (
    <TopicsView
      title={folderName ? `${folderName} · Topics` : 'Topics'}
      lists={lists ?? (read === 'failed' ? 'failed' : 'loading')}
      tab={tab}
      onTab={setTab}
      onRetry={() => void reloadTopics()}
      onJoin={(address) => void onJoin(address)}
      joining={joining}
    />
  )
}
