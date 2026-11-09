import { useMemo } from 'react'
import type { Archives } from '@/lib/archive'
import { sidebarTopicsOf, topicOfD, yourTopics, type SidebarTopic, type TopicPageWork } from '@/lib/topics'
import { reloadTopics, useMuted, useTopicActivity, useTopics, useTopicsOnReturn } from './topics'

/** The sidebar's topics, and where the route is among them. */
export interface SidebarTopics {
  topics: SidebarTopic[] | 'loading' | 'failed'
  onRetryTopics: () => void
  /** The open topic's address, when the route is a topic's page. */
  openTopic?: string
}

/**
 * Your five newest topics for the sidebar (TOPI-9): the topics read, your
 * mute list and their activity, read on open and again when you come back to
 * the tab, never live, so the five stay put while you work (Miky, 6 Nov).
 * Until the workspace is read they draw without their projects and issues.
 */
export function useSidebarTopics(work: TopicPageWork | undefined, archives: Archives | undefined, topicD: string | undefined): SidebarTopics {
  useTopicsOnReturn()
  const read = useTopics()
  const held = read === 'failed' ? undefined : read
  const muted = useMuted()
  const yours = useMemo(() => (held ? yourTopics(held, muted) : undefined), [held, muted])
  const order = useTopicActivity(held, yours)
  const topics = useMemo(() => {
    if (read === 'failed' || order.failed) return 'failed' as const
    if (!held || !order.values) return 'loading' as const
    return sidebarTopicsOf(held, order.values, work ?? { projects: [], issues: [] }, archives ?? NO_ARCHIVES, muted)
  }, [read, held, order.values, order.failed, work, archives, muted])
  const openTopic = held && topicD ? topicOfD(held, topicD)?.address : undefined
  return {
    topics,
    onRetryTopics: () => (read === 'failed' ? void reloadTopics() : order.retry()),
    ...(openTopic ? { openTopic } : {}),
  }
}

/** Before the workspace is read: nothing is archived, as nothing is drawn under a topic yet. */
const NO_ARCHIVES: Archives = { ofIssue: () => undefined, ofProject: () => undefined }
