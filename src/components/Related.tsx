import { IconLock } from '@tabler/icons-react'
import { Avatar, Card, EmptyState, Link } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { thisObject, typeLabelOf } from '@/lib/typeLabel'
import { pickWidget, type ForeignObject, type ResolvedSlot } from '@/api/foreign'
import type { RelatedState } from '@/api/useRelated'

import { ConversationCount } from '@/components/ui/ConversationCount'
import { Person } from '@/components/ui/Person'
import { ShipRichText } from '@/components/ui/ShipRichText'
import { StatusLabel } from '@/components/ui/StatusLabel'


/**
 * The files placed under this project or issue — RFC 0.5 §10.7, *nesting is
 * by intent* — as quiet rows (Katerina, 29 September). Related as rows with no box, a row filling while pointed at.
 *
 * **Everything production's `Related` draws is still drawn**, because every row
 * is still whatever the other app's projection says (RFC 0.4 §13.1) and Ship
 * never learns what any app is:
 *
 * - the title, with the app's name right after it, muted (15: what a row is,
 *   where the eye already is), and the subtitle and the meta on a second line;
 * - the status and the comment count in two columns that line up down the list;
 * - `message` objects as a face, a name and the text;
 * - an object this reader may not see, said so ("You may not have access…"),
 *   never drawn as an empty row;
 * - an object's own list (`children`) and what is placed under a file
 *   (`inside`), nested under it with a line down the left, at any depth;
 * - a read that failed, in words; nothing placed, nothing drawn;
 * - every row opening the file in its own app.
 *
 * Finding 15 also asked for an app icon and an issue's id. Neither can be
 * drawn honestly yet: a projection carries no icon, and an id is a slot only
 * some apps send. The app's name moved next to the title instead.
 */
const IMPLEMENTED = ['message', 'card', 'row'] as const

function SlotValue({ slot, people }: { slot: ResolvedSlot; people?: ForeignObject['people'] }) {
  if (slot.isPubkey) {
    const profile = people?.[slot.value]
    return <Person name={profile?.displayName} picture={profile?.picture} size={16} />
  }
  return <span className="truncate">{slot.value}</span>
}

const ROW = 'grid grid-cols-[minmax(0,1fr)_7rem_4rem] items-center gap-3 px-2 py-1.5'

function Row({ object, count }: { object: ForeignObject; count?: number }) {
  if (object.unreachable) {
    return (
      <Card fill="none" unreadable className={cn(ROW, 'grid-cols-1')} data-foreign-object={object.ref} data-state="unreachable">
        <span className="flex items-center gap-2 text-body-2 text-text-muted">
          <IconLock size={14} stroke={1.5} className="shrink-0" />
          <span className="truncate">
            You may not have access to {thisObject(object)}.
            {object.openUrl && (
              <>
                {' '}
                <Link href={object.openUrl} variant="underlined">
                  Open it there
                </Link>
                .
              </>
            )}
          </span>
        </span>
      </Card>
    )
  }

  const widget = pickWidget(object.widget, IMPLEMENTED, 'card')
  const { slots, meta } = object

  if (widget === 'message') {
    const author = slots.title
    const profile = author?.isPubkey ? object.people?.[author.value] : undefined
    return (
      <Card href={object.openUrl || undefined} fill="none" hover="fill" quietUntilHover className="flex items-start gap-2 px-2 py-1.5" data-foreign-object={object.ref} data-widget="message">
        <Avatar name={profile?.displayName} src={profile?.picture} size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className={cn('text-body-2-strong', profile?.displayName ? 'text-text-primary' : 'text-text-muted')}>{profile?.displayName ?? '—'}</span>
          {slots.body && (
            <div className="line-clamp-2">
              <ShipRichText value={slots.body.value} format={slots.body.format ?? 'marker'} size="small" hideStandalone />
            </div>
          )}
        </div>
        {typeLabelOf(object) && <span className="shrink-0 text-caption text-text-muted">{typeLabelOf(object)}</span>}
      </Card>
    )
  }

  const second = slots.subtitle || meta.length > 0
  return (
    <Card href={object.openUrl || undefined} fill="none" hover="fill" quietUntilHover className={ROW} data-foreign-object={object.ref} data-widget={widget === 'row' ? 'row' : 'card'}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-body-2 text-text-primary">{slots.title?.value ?? 'Untitled'}</span>
          {typeLabelOf(object) && <span className="shrink-0 text-caption text-text-muted">{typeLabelOf(object)}</span>}
        </span>
        {second && (
          <span className="flex min-w-0 items-center gap-1.5 text-caption text-text-muted">
            {slots.subtitle && <span className="truncate">{slots.subtitle.value}</span>}
            {meta.map((entry, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                {(i > 0 || slots.subtitle) && <span aria-hidden>·</span>}
                {entry.label && <span>{entry.label}</span>}
                <SlotValue slot={entry} people={object.people} />
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="flex min-w-0">{slots.status && <StatusLabel value={slots.status.value} label={slots.status.value} colour={slots.status.colour} size="small" />}</span>
      <span className="flex justify-end">{count !== undefined && count > 0 && <ConversationCount count={count} unit="comment" />}</span>
    </Card>
  )
}

/** A file, then what is under it — its own list, and what was placed under it — one line down their left. */
function Item({ object, related }: { object: ForeignObject; related: Exclude<RelatedState, 'failed' | undefined> }) {
  const placed = related.inside[object.ref] ?? []
  const own = object.children ?? []
  return (
    <div className="flex flex-col" data-related-file={object.ref}>
      <Row object={object} count={related.counts[object.ref]} />
      {object.children?.length === 0 && (
        <div className="ml-6 py-1">
          <EmptyState scope="section" message="Nothing in it yet." />
        </div>
      )}
      {(own.length > 0 || placed.length > 0) && (
        <div className="ml-4 flex flex-col border-l border-border-default pl-2" data-inside={object.ref}>
          {own.map((child) => (
            <Row key={child.ref} object={child} />
          ))}
          {placed.map((child) => (
            <Item key={child.ref} object={child} related={related} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Related({ related }: { related: RelatedState }) {
  if (related === 'failed') {
    return (
      <p className="text-body-2 text-text-muted" data-related="failed">
        Files placed under this could not be read.
      </p>
    )
  }
  if (!related || related.files.length === 0) return null
  return (
    <div className="-mx-2 flex flex-col" data-related="files">
      {related.files.map((file) => (
        <Item key={file.ref} object={file} related={related} />
      ))}
    </div>
  )
}

/**
 * Whether a page should draw the Related heading at all.
 *
 * Nearly every project has nothing placed under it today, and a heading over
 * nothing on every page is noise rather than honesty — the honest cases are
 * the ones with something to say: files, or a read that failed. An empty,
 * successful read is the one state that stays silent.
 */
export function hasRelated(related: RelatedState): boolean {
  return related === 'failed' || (related !== undefined && related.files.length > 0)
}
