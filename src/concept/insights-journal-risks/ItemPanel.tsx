/**
 * CONCEPT — an item opened beside its list, as Peek opens a thread beside its topic (Miky, 16 Nov: "it should not open
 * outside"): the kit's Panel in the 384px column the side Overview and Comments use, its ✕ closing it. Holds the item
 * as its list shows it (ItemDetail), then its comments.
 */
import { useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { IconButton, Panel, Tabs } from '@estiva-app/ui'
import { GroupLook, History, Uses, fileUnder, historyOf } from './Memory'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { CommentsColumn, type StoryComment } from './CommentsColumn'
import { ItemContent, ItemFields, ItemIdentity, ItemWords, fromTool } from './ItemDetail'
import { CLAUDE, KATERINA, MIKY, TEAM, type Item } from './fixtures'

export { ItemFields } from './ItemDetail'

/** Each item's conversation, in its own words: a Question's is about its options; a tool's insight has none yet. */
export const commentsOn = (item: Item): StoryComment[] => {
  if (fromTool(item) || item.layer === 'personal') return []
  if (item.word === 'Question' && item.options)
    return [
      { id: 'q1', author: KATERINA, time: '2h', text: 'C keeps files where people already look for them. I’d start there.' },
      { id: 'q2', author: MIKY, time: '1h', text: 'B reads better for Bugs: Engineering leads it, everyone reads it.' },
    ]
  if (item.word === 'Blocker') return [{ id: 'q1', author: CLAUDE, time: '1d', text: 'Still blocked: I can’t add Katerina to Design until this is done.' }]
  if (item.word === 'Update') return [{ id: 'q1', author: KATERINA, time: '3h', text: 'Ship feels so much faster this week.' }]
  if (item.type === 'journal') return [{ id: 'q1', author: KATERINA, time: '20m', text: '@Miky why not keep Folders under each team, folded?' }]
  return [{ id: 'q1', author: KATERINA, time: '20m', text: 'Agreed, I hit this again today.' }]
}

/**
 * The alternative with fewer sections (Miky, 27 Nov: "lots of section"): the item and its Properties stay in view, and
 * everything else is one tab at a time under them: Used in (the file it is applied to, then the AI sessions that read
 * it), its Comments (with the box), and its History, which starts with its sources as they were written.
 */
function TabbedItemPanel({ item, me, here, onClose, onDecide, deciding }: { item: Item; me: string; here?: string; onClose: () => void; onDecide?: (choice: number, why: string) => void; deciding?: boolean }) {
  const [tab, setTab] = useState('used')
  const [moving, setMoving] = useState(false)
  const file = fileUnder(() => setMoving(true))
  const comments = commentsOn(item)
  const tabs = [
    { id: 'used', label: 'Used in', unread: false },
    { id: 'comments', label: comments.length ? `Comments ${comments.length}` : 'Comments', unread: false },
    // Something in it can still be undone: the dot says so.
    { id: 'history', label: 'History', unread: historyOf(item).some((e) => e.undo) },
  ]
  return (
    <div className="flex w-[384px] min-h-0 shrink-0 flex-col border-l border-border-default">
      <Panel
        title={<ItemIdentity item={item} />}
        actions={
          <IconButton variant="muted" tooltip="Close" aria-label="Close" onClick={onClose}>
            <IconX size={16} stroke={1.5} />
          </IconButton>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="max-h-[55%] shrink-0" contentClassName="flex flex-col gap-3 px-4 pb-3">
            <span className="flex flex-col gap-1">
              <span className="text-h3 text-text-primary">{item.title}</span>
              <ItemWords item={item} />
            </span>
            <ItemFields key={item.id} item={item} me={me} />
            <ItemContent key={`${item.id}-${item.status}`} item={item} me={me} here={here} words={false} trail={false} onDecide={onDecide} deciding={deciding} />
          </ScrollArea>
          <div className="flex shrink-0 items-center justify-between border-y border-border-default px-3 py-1.5">
            <Tabs tabs={tabs} active={tab} onChange={setTab} />
            {/* Used in's one action, on the same line as its name (Miky, 27 Nov), as the grouped panel's header has it. */}
            {tab === 'used' && (
              <IconButton variant="muted" tooltip={file.tooltip} aria-label={file.tooltip} onClick={file.onClick}>
                {file.icon}
              </IconButton>
            )}
          </div>
          {tab === 'comments' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <CommentsColumn team={TEAM} about={item.title} comments={comments} bare />
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1" contentClassName="flex flex-col gap-3 px-4 py-3">
              {/* Each tab holds one group, without its card or header: the tab already says what it is. */}
              <GroupLook.Provider value="bare">
                {tab === 'used' && <Uses item={item} here={here} moving={moving} onMoving={setMoving} />}
                {tab === 'history' && <History item={item} />}
              </GroupLook.Provider>
            </ScrollArea>
          )}
        </div>
      </Panel>
    </div>
  )
}

/** The item beside its list: what it is as its list labels it, the whole item, then its comments. */
export function ItemPanel({ item, me = 'miky', here, onClose, onDecide, deciding, layout = 'groups' }: { item: Item; me?: string; here?: string; onClose: () => void; onDecide?: (choice: number, why: string) => void; deciding?: boolean; layout?: 'groups' | 'tabs' }) {
  if (layout === 'tabs') return <TabbedItemPanel item={item} me={me} here={here} onClose={onClose} onDecide={onDecide} deciding={deciding} />
  return (
    <div className="flex w-[384px] min-h-0 shrink-0 flex-col border-l border-border-default">
      <Panel
        title={<ItemIdentity item={item} />}
        actions={
          <IconButton variant="muted" tooltip="Close" aria-label="Close" onClick={onClose}>
            <IconX size={16} stroke={1.5} />
          </IconButton>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="max-h-[65%] shrink-0" contentClassName="flex flex-col gap-3 px-4 pb-4">
            <span className="flex flex-col gap-1">
              <span className="text-h3 text-text-primary">{item.title}</span>
              <ItemWords item={item} />
            </span>
            <ItemFields key={item.id} item={item} me={me} />
            <ItemContent key={`${item.id}-${item.status}`} item={item} me={me} here={here} words={false} onDecide={onDecide} deciding={deciding} />
          </ScrollArea>
          <div className="flex min-h-0 flex-1 flex-col border-t border-border-default">
            <CommentsColumn team={TEAM} about={item.title} comments={commentsOn(item)} />
          </div>
        </div>
      </Panel>
    </div>
  )
}
