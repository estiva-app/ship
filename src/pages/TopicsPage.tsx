import { useCallback, useMemo, useState } from 'react'
import type { FolderSummary } from '@estiva-app/interop'
import type { AvatarGroupMember } from '@estiva-app/ui'
import { me, type DirectoryView } from '@/api'
import type { Say } from '@/pages/act'
import { reloadTopics, rereadTopics, useMuted, useTopicActivity, useTopicMembers, useTopics } from '@/api/topics'
import { joinTopic } from '@/api/writes'
import { topicAsDrawn } from '@/api/foreign'
import { useTabTitle } from '@/lib/tabTitle'
import { joinedToYours, topicsByTab, yourTopics, type TopicRowData, type TopicsTab } from '@/lib/topics'
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
 * no other topic's (the kickoff's load cost). A topic you join here moves to
 * Your initiatives at once, Join gone and one more member, and the topics are
 * read again so the sidebar's five take it too, as Peek's and Leaf's Join do
 * (Miky, 10 Nov; it was "on the next open", 6 Nov).
 */
export function TopicsPage({ folders, folder, say, directory }: { folders: FolderSummary[] | undefined; folder?: string; say: Say; directory?: Pick<DirectoryView, 'profileOf'> }) {
  const [tab, setTab] = useState<TopicsTab>('yours')
  const [joining, setJoining] = useState<ReadonlySet<string>>(new Set())
  const [joined, setJoined] = useState<ReadonlySet<string>>(new Set())
  const read = useTopics()
  const held = read === 'failed' ? undefined : read
  const { muted } = useMuted()
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
    // You, counted once: one more member while the people read does not list you yet (a muted topic you follow already
    // does), before and after the topics are read again.
    const withJoined = (row: TopicRowData): TopicRowData =>
      joined.has(row.address) ? { ...row, yours: true, ...(row.people && !row.people.includes(me) ? { members: row.people.length + 1 } : {}) } : row
    return joinedToYours(Object.fromEntries(Object.entries(drawn).map(([id, rows]) => [id, rows.map(withJoined)])) as typeof drawn, joined, active.values ?? order.values)
  }, [held, order.values, order.failed, active.values, members.values, teamName, folder, muted, joined])
  // A row's faces: who Ship knows by profile, a dash for anyone it does not, as Peek's Explore draws them (Katerina, 18 November).
  const profileOf = directory?.profileOf
  const faceOf = useCallback(
    (pubkey: string): AvatarGroupMember => {
      const profile = profileOf?.(pubkey)
      return { name: profile?.name ?? '—', ...(profile?.picture ? { picture: profile.picture } : {}), ...(profile?.bot ? { bot: true } : {}) }
    },
    [profileOf],
  )
  const folderName = folder ? (folders?.find((summary) => summary.id === folder)?.name ?? 'Untitled team') : undefined
  // Peek's words (Katerina, 18 November): Explore initiatives; a team's, as its sidebar entry says. The tab says the heading, as every page's does (SFX-2).
  const title = folderName ? `${folderName} · Initiatives` : 'Explore initiatives'
  useTabTitle(folder && !folders ? undefined : title)

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
    const title = topicAsDrawn(topic.address, topic.folder, topic.object).title
    // As Peek's Join says it (useFileControls). Joined while the mute stays: Join stays too, so a second click takes the mute out.
    if (!result.ok) say(`Nothing changed: “${title}” could not be joined. ${result.reason}`, 'error', 'not-joined')
    else if ('stillMuted' in result) say(`Joined “${title}”, but it is still muted. Join again to unmute it.`, 'error', 'not-saved')
    else {
      setJoined((now) => new Set(now).add(address))
      // Peek's Join toast, word for word, and like Peek's Explore no Undo (Katerina, 18 November, E1). Join lands at
      // Important, as Peek's does (her 18 November "let's make it to important"): `joinTopic` writes what Peek's writes.
      say(`You joined ${title}. Notifications: Important.`)
    }
    // Read the topics again, so the sidebar's five take the joined one too (Miky, 10 Nov), as Leaf's Join does.
    if (result.ok) void rereadTopics()
  }

  return (
    <TopicsView
      title={title}
      lists={lists ?? (read === 'failed' ? 'failed' : 'loading')}
      tab={tab}
      onTab={setTab}
      onRetry={() => void reloadTopics()}
      onJoin={(address) => void onJoin(address)}
      joining={joining}
      faceOf={faceOf}
    />
  )
}
