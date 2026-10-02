import { Card, Link } from '@estiva-app/ui'
import { cn } from '@/lib/cn'
import { thisObject, typeLabelOf } from '@/lib/typeLabel'
import { Avatar } from './Avatar'
import { Chip } from './Chip'
import { ConversationCount } from './ConversationCount'
import { EmptyState } from './EmptyState'
import { Person } from './Person'
import { StatusLabel } from './StatusLabel'
import { RichText } from './RichText'
import { pickWidget } from '@/api/foreign'
import type { ForeignObject as ForeignObjectData, ResolvedSlot } from '@/api/foreign'

/**
 * Another app's object, drawn in Ship's design language.
 *
 * **The rule this file exists to honour** (RFC 0.4 §13.1): the owner defines
 * the projection, the consumer decides how it looks. Everything here is
 * layout; not one line knows what Peek is, and if it ever needs to, the
 * projection layer has failed rather than this component being incomplete.
 *
 * What arrives is a title, some secondary values, maybe a status, maybe a list
 * of children, and a widget *hint*. What does not arrive is layout — an owner
 * who could specify that would be designing Ship's product.
 *
 * ## A foreign message's body is formatted, small
 *
 * Ship's rule is that a body is "untrusted text from other people and other
 * apps: rendered as text, never as markup". It used to be shown raw, because
 * RIC-1 had not decided the format and a parser here would have been a third
 * private dialect (RFC 0.4 §14.2). It has decided: `toRenderTree` resolves the
 * body, and the package's `RichText` draws it as text, in the `small` size an
 * item inside a card takes (Katerina, 28 September, UIG-30). Nothing is ever
 * set as markup.
 */

/**
 * The widget types this consumer implements. A chain must terminate in one of
 * the four RFC 0.4 §13.3 closes; the extra entry here is what Ship adds.
 */
const IMPLEMENTED = ['message', 'card', 'row'] as const

/*
  The walking itself lives in the runtime, not here — PRO-7.

  Ship had its own copy of this for about an hour, which is exactly how the two
  implementations §13.3 warns about get created: they agree until a chain has
  three entries and then quietly disagree. The consumer says what it implements
  and the runtime does the rest.
*/

function Dot() {
  return <span aria-hidden className="text-text-muted">·</span>
}

/** A slot's value, as a person when the manifest says it is one. */
function SlotValue({ slot, people }: { slot: ResolvedSlot; people?: ForeignObjectData['people'] }) {
  if (slot.isPubkey) {
    const profile = people?.[slot.value]
    // Never the key on screen. Nobody has published a kind:0 for most pubkeys,
    // and an em dash is the same mark a property with no value uses.
    return <Person name={profile?.displayName} picture={profile?.picture} size={16} />
  }
  return <span className="truncate">{slot.value}</span>
}

export interface ForeignObjectProps {
  object: ForeignObjectData
  /**
   * Comments addressed to this object, from `conversationCountsOf` — drawn on
   * a card or a row when the caller has asked for it. Not on the object
   * itself, because a folder listing deliberately does not fetch it (one more
   * query per listing) and a Related section does: the count is the section's
   * to ask for, the widget's to draw.
   */
  conversations?: number
  className?: string
}

/**
 * Another app's item, mentioned here, drawn as a card in each of its six
 * states, so "you cannot see this" never looks like "this is empty".
 *
 * The six states a foreign object has, and why they are not two.
 *
 * A gated read returns *nothing* — the same nothing as an object with no
 * content — so "you cannot see this" and "this is empty" arrive identically
 * from the relay and must never look identical on screen. `unreachable` is the
 * resolver telling us which one it was.
 */
export function ForeignObject({ object, conversations, className }: ForeignObjectProps) {
  if (object.unreachable) {
    return (
      <Card
        fill="surface"
        unreadable
        className={cn('p-3', className)}
        data-foreign-object={object.ref}
        data-state="unreachable"
      >
        {/* The words' look on a box inside the card: Card draws the frame only (UIG-9). */}
        <div className="text-body-2 text-text-muted">
          You may not have access to {thisObject(object)}.
          {object.openUrl && (
            <>
              {' '}
              <span className="text-text-secondary">
                <Link href={object.openUrl} variant="underlined">
                  Open it there
                </Link>
              </span>
              .
            </>
          )}
        </div>
      </Card>
    )
  }

  const widget = pickWidget(object.widget, IMPLEMENTED, 'card')
  return widget === 'message' ? (
    <ForeignMessage object={object} className={className} />
  ) : (
    <ForeignCard object={object} row={widget === 'row'} conversations={conversations} className={className} />
  )
}

/**
 * A message: a face, a name, a body. None of `card`/`row`/`table`/`stat`
 * describes one, which is exactly why the chain exists.
 */
function ForeignMessage({ object, className }: ForeignObjectProps) {
  const author = object.slots.title
  const profile = author?.isPubkey ? object.people?.[author.value] : undefined
  return (
    <div
      className={cn('flex gap-2 py-1.5', className)}
      data-foreign-object={object.ref}
      data-widget="message"
    >
      <Avatar name={profile?.displayName} src={profile?.picture} size={24} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-caption text-text-muted">
          <span className={cn('truncate', profile?.displayName ? 'text-text-secondary' : 'text-text-muted')}>
            {profile?.displayName ?? '—'}
          </span>
        </div>
        {/*
          Formatted, never markup. See the note at the top of this file. A
          pointer alone on its line leaves the text, so a message that is only
          one draws nothing rather than a line of bech32; one inside a sentence
          stays, as a chip.
        */}
        {object.slots.body && (
          <RichText value={object.slots.body.value} format={object.slots.body.format ?? 'marker'} size="small" hideStandalone />
        )}
      </div>
    </div>
  )
}

function ForeignCard({ object, row, conversations, className }: ForeignObjectProps & { row?: boolean }) {
  const { slots, meta, children } = object
  const body = (
    <>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate text-body-2-strong text-text-primary">
          {/* `title` is the one required slot, so there is always something to
              name the object with — which is what makes ignoring an unknown
              slot safe rather than merely tolerable (§13.3). */}
          {slots.title?.value ?? 'Untitled'}
        </span>
        {/*
          The count before the chip — what is said about the file, then whose
          it is — the same order an issue row keeps.

          Centred on each other in a group of their own (Katerina, 22
          September). The row is `items-start`, so the count, which is 14.4px
          against the chip's 20, floated 2.6px above it; aligning the whole row
          instead would move the title, which is meant to sit at the top of a
          card whose subtitle may wrap.
        */}
        <span className="flex shrink-0 items-center gap-2">
          {conversations !== undefined && <ConversationCount count={conversations} unit="comment" />}
          {typeLabelOf(object) && <Chip label={typeLabelOf(object)!} />}
        </span>
      </div>
      {slots.subtitle && (
        <p className="line-clamp-2 text-body-2 text-text-secondary">{slots.subtitle.value}</p>
      )}
      {(slots.status || meta.length > 0) && (
        <div className="flex flex-wrap items-center gap-2.5 text-caption text-text-muted">
          {slots.status && (
            /*
              By the colour, not the value — UIG-18. The projection replaced
              the raw status with its label before it reached here, so passing
              the value drew a plain circle for every app, Ship's own objects
              included. See `StatusLabel`'s `colour`.
            */
            <StatusLabel value={slots.status.value} label={slots.status.value} colour={slots.status.colour} size="small" />
          )}
          {meta.map((entry, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 || slots.status ? <Dot /> : null}
              {entry.label && <span>{entry.label}</span>}
              <SlotValue slot={entry} people={object.people} />
            </span>
          ))}
        </div>
      )}
      {/*
        The `list` slot. Children are resolved through *their own* projection,
        so this renders each with the same component rather than a reduced copy
        — which is what makes "a card with its children underneath" compose
        instead of being a special case.

        `children === undefined` means no list was declared; `[]` means one was
        and nothing matched. Those are different sentences and this draws
        neither the same way as the other.

        A line between the children, and none above the first (Katerina, 22
        September): the card's own edge already says where its contents begin.
      */}
      {children && children.length > 0 && (
        <div className="mt-1 flex flex-col divide-y divide-border-default">
          {children.map((child) => (
            <ForeignObject key={child.ref} object={child} />
          ))}
        </div>
      )}
      {children?.length === 0 && <EmptyState scope="section" message="Nothing in it yet." className="mt-1" />}
    </>
  )

  const layout = cn('flex flex-col gap-2 p-3', row && 'py-2', className)

  return (
    <Card href={object.openUrl || undefined} fill="surface" className={layout} data-foreign-object={object.ref} data-widget={row ? 'row' : 'card'}>
      {body}
    </Card>
  )
}
