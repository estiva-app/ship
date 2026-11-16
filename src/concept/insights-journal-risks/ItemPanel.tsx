/**
 * CONCEPT — an item opened beside its list, as Peek opens a thread beside its topic (Miky, 16 Nov: "it should not open
 * outside"): the kit's Panel in the 384px column the side Overview and Comments use, its ✕ closing it. Holds the item
 * whole: title, status and fields, summary, details, its source as marked, then its comments.
 */
import { useState } from 'react'
import { IconUsers, IconX } from '@tabler/icons-react'
import { IconButton, LinkPickers, MetaText, Panel, Select } from '@estiva-app/ui'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { STATUSES, TYPE_META, type Status } from './MarkAs'
import { SourceAsMarked } from './ItemParts'
import { CommentsColumn, type StoryComment } from './CommentsColumn'
import { CATEGORIES, KATERINA, PEOPLE, TEAM, type Item } from './fixtures'

/** An item's fields: its status picker with its type's words, Decided by on a Journal entry, an Insight's category. */
export function ItemFields({ item, me = 'miky' }: { item: Item; me?: string }) {
  const [status, setStatus] = useState<Status>(item.status)
  const [decider, setDecider] = useState(item.decidedBy?.key)
  const [category, setCategory] = useState<string>(item.category ?? '')
  const people = PEOPLE.map((p) => ({ value: p.key, label: p.name }))
  const waitingOn = status === 'proposed' && item.decidedBy && item.decidedBy.key !== me ? item.decidedBy.name : undefined
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <LinkPickers
          status={{ value: status, options: STATUSES[item.type], onChange: (v) => setStatus(v as Status) }}
          {...(item.type === 'journal' ? { owner: { value: decider, options: people, onChange: setDecider }, ownerLabel: 'Decided by' } : {})}
        />
        {item.type === 'insight' && (
          <Select size="small" ariaLabel="Category" placeholder="Category" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
        )}
      </div>
      <MetaText tone="muted">
        <IconUsers size={12} stroke={1.5} className="mr-1 inline" />
        {item.team} · about {item.about ? item.about.title : 'nothing yet'} · {item.decidedBy ? `written by ${item.markedBy.name}` : `marked by ${item.markedBy.name}`} · {item.at}
        {item.acceptedBy && status !== 'proposed' ? ` · accepted by ${item.acceptedBy.name}` : ''}
      </MetaText>
      {waitingOn && <MetaText tone="muted">Waiting for {waitingOn} to accept — they were told once, when named.</MetaText>}
    </div>
  )
}

export const commentsOn = (item: Item): StoryComment[] =>
  item.type === 'journal'
    ? [{ id: 'q1', author: KATERINA, time: '20m', text: '@Miky why not keep Folders under each team, folded?' }]
    : [{ id: 'q1', author: KATERINA, time: '20m', text: 'Agreed, I hit this again today.' }]

/** The item beside its list: the whole item above, its comments under it. */
export function ItemPanel({ item, me = 'miky', onClose }: { item: Item; me?: string; onClose: () => void }) {
  const meta = TYPE_META[item.type]
  return (
    <div className="flex w-[384px] min-h-0 shrink-0 flex-col border-l border-border-default">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span className={meta.text}>{meta.icon(16)}</span>
            {item.word}
          </span>
        }
        actions={
          <IconButton variant="muted" tooltip="Close" aria-label="Close" onClick={onClose}>
            <IconX size={16} stroke={1.5} />
          </IconButton>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="max-h-[60%] shrink-0" contentClassName="flex flex-col gap-3 px-4 pb-4">
            <span className="text-h3 text-text-primary">{item.title}</span>
            <ItemFields key={item.id} item={item} me={me} />
            {item.summary && <span className="text-body-2 text-text-primary">{item.summary}</span>}
            {item.details && <span className="whitespace-pre-line text-body-2 text-text-secondary">{item.details}</span>}
            <SourceAsMarked source={item.source} />
          </ScrollArea>
          <div className="flex min-h-0 flex-1 flex-col border-t border-border-default">
            <CommentsColumn team={TEAM} about={item.title} comments={commentsOn(item)} />
          </div>
        </div>
      </Panel>
    </div>
  )
}
