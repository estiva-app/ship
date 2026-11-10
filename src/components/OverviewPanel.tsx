import type { ReactNode } from 'react'
import { CollapsibleSection, Panel, SectionHeader } from '@estiva-app/ui'
import type { ActivityItem } from '@/components/Activity'
import { History, type HistoryEntry } from '@/components/History'
import { Related, hasRelated } from '@/components/Related'
import { MentionList } from '@/components/conversations/ThreadList'
import type { RelatedState } from '@/api/useRelated'

export interface OverviewPanelProps {
  /** The conversations elsewhere that name it, newest activity first (`activityFor`). */
  activity: ActivityItem[]
  /** How many the horizon left out — `ACTIVITY_HORIZON`. Said under them, never implied. */
  activityTruncated?: number
  /** Still on the way (APP-5): drawn as loading, never as none. */
  loading?: boolean
  /** Its own changes, in words. */
  history: HistoryEntry[]
  /**
   * History starts folded and its changes are read when it opens (ALO-19: a
   * project's, whose opening reads no older change); folded again on every
   * visit, so leaving it open never brings the read back unasked (Miky,
   * 2026-11-10). `pending` while the read is on the way. Absent, History is
   * drawn open, as an issue's still is.
   */
  historyFold?: { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean }
  /** The topics that list it, with Add to topic (TOP-5): `FileTopicsOf`, which reads and writes them itself. */
  topics?: ReactNode
  /** Files placed under it from other apps (RFC 0.5 §10.7). Drawn only when there is something to say (`hasRelated`). */
  related?: RelatedState
  /** The page's own address: its links in the mentions keep their chip and draw no card (WID-3). */
  about?: string
  nameOf?: (pubkey: string) => string
}

/**
 * An issue's or a project's Overview: Peek's third column, in the column beside the page in place of the comments
 * (Katerina, 2 November; ONE-6, step 4d). "Activity", the conversations elsewhere that name it, read-only as Peek
 * draws them; then its "History"; then its "Topics", the rail's until the rail went (TOP-5); then "Related", what
 * was placed under it, when there is any. One scroll for all four, as Peek's (27 September).
 */
export function OverviewPanel({ activity, activityTruncated, loading, history, historyFold, topics, related, about, nameOf }: OverviewPanelProps) {
  return (
    <Panel title="Overview" className="min-h-0 w-96 flex-1" bodyClassName="flex flex-col pb-4">
      {/* Peek's spacing: 16px above the heading, its own 8px inset brought to the cards' 16px edge, its count beside it. */}
      <SectionHeader title="Activity" count={activity.length > 0 ? activity.length : undefined} hover="none" className="mx-2 mt-4" />
      <div className="px-4 pb-4 pt-1">
        <MentionList items={activity} loading={loading} truncated={activityTruncated} about={about} nameOf={nameOf} />
      </div>
      {historyFold ? (
        <CollapsibleSection title="History" open={historyFold.open} onOpenChange={historyFold.onOpenChange} pending={historyFold.pending} className="mx-2" contentClassName="px-2 pt-1">
          <History entries={history} />
        </CollapsibleSection>
      ) : (
        <>
          <SectionHeader title="History" hover="none" className="mx-2" />
          <div className="px-4 pt-1">
            <History entries={history} />
          </div>
        </>
      )}
      {topics && (
        <>
          <SectionHeader title="Topics" hover="none" className="mx-2 mt-4" />
          <div className="px-4 pt-1">{topics}</div>
        </>
      )}
      {hasRelated(related) && (
        <>
          <SectionHeader title="Related" hover="none" className="mx-2 mt-4" />
          <div className="px-4 pt-1">
            <Related related={related} />
          </div>
        </>
      )}
    </Panel>
  )
}
