import { useMemo } from 'react'
import type { Archives } from '@/lib/archive'
import { sidebarTopicsOf, topicOfD, yourTopicsOf, type SidebarTopic, type TopicPageWork } from '@/lib/topics'
import type { Route } from '@/router'
import { reloadTopics, useMuted, useTopicActivity, useTopics, useTopicsOnReturn, useYourTopics } from './topics'

/** The sidebar's topics, and where the route is among them. */
export interface SidebarTopics {
  topics: SidebarTopic[] | 'loading' | 'failed'
  onRetryTopics: () => void
  /** The open topic's address, when the route is a topic's page. */
  openTopic?: string
}

/**
 * Your five newest topics for the sidebar (TOPI-9), read on open and again
 * when you come back to the tab, never live, so the five stay put while you
 * work (Miky, 6 Nov). Until the workspace is read they draw without their
 * projects and issues.
 *
 * Where they come from depends on the page (ALO-17). On Topics and a topic's
 * page, which read every topic anyway, from that read, the page's activity
 * and the one mute list the tab holds: the sidebar reads nothing of its own
 * there. Everywhere else, from interop's lean read of only your topics, one
 * per tab: no read of every topic for five names.
 */
export function useSidebarTopics(work: TopicPageWork | undefined, archives: Archives | undefined, route: Route): SidebarTopics {
  const onTopics = route.name === 'topics' || route.name === 'topic'

  // Topics and a topic's page: what the page reads.
  useTopicsOnReturn(onTopics)
  const read = useTopics(onTopics)
  const held = read === 'failed' ? undefined : read
  const { muted, settled } = useMuted(onTopics)
  // Your five wait for the mute list's first answer, so a muted topic is never drawn and then taken out.
  const fromPage = useMemo(() => (held && settled ? yourTopicsOf(held, muted) : undefined), [held, settled, muted])
  const addresses = useMemo(() => fromPage?.map((topic) => topic.address), [fromPage])
  // Away from Topics only the activity the tab holds: no read, and none again on return to the tab.
  const order = useTopicActivity(onTopics ? held : undefined, addresses)

  // Every other page: the lean read.
  const lean = useYourTopics(!onTopics)
  const leanRead = lean.read === 'failed' ? undefined : lean.read

  // Each source the tab holds, read or not on this page: moving between pages keeps the five drawn
  // from what is held until the page's own source lands (Miky, 6 Nov: the five stay put while you work).
  const topics = useMemo(() => {
    const drawn = work ?? { projects: [], issues: [] }
    const pageFive = fromPage && order.values ? sidebarTopicsOf(fromPage, order.values, drawn, archives ?? NO_ARCHIVES) : undefined
    const leanFive = leanRead ? sidebarTopicsOf(leanRead.topics, leanRead.at, drawn, archives ?? NO_ARCHIVES) : undefined
    const [own, other] = onTopics ? [pageFive, leanFive] : [leanFive, pageFive]
    if (own) return own
    const failed = onTopics ? read === 'failed' || order.failed : lean.read === 'failed'
    if (failed) return 'failed' as const
    return other ?? ('loading' as const)
  }, [onTopics, read, fromPage, order.values, order.failed, lean.read, leanRead, work, archives])
  // Only your topics can be open in the sidebar: the only ones it draws.
  const yours = (onTopics ? fromPage : leanRead?.topics) ?? (onTopics ? leanRead?.topics : fromPage)
  const openTopic = route.name === 'topic' && yours ? topicOfD(yours, route.d)?.address : undefined
  return {
    topics,
    onRetryTopics: () => {
      if (!onTopics) lean.retry()
      else if (read === 'failed') void reloadTopics()
      else order.retry()
    },
    ...(openTopic ? { openTopic } : {}),
  }
}

/** Before the workspace is read: nothing is archived, as nothing is drawn under a topic yet. */
const NO_ARCHIVES: Archives = { ofIssue: () => undefined, ofProject: () => undefined }
