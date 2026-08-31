import { stripNaddrs } from '@estiva-app/protocol'
import { cn } from '@/lib/cn'
import { Avatar } from './Avatar'
import { Chip } from './Chip'
import { Person } from './Person'
import { StatusLabel } from './StatusLabel'
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
 * ## Ship renders a foreign body as text, and that survives here
 *
 * Ship's rule is that a body is "untrusted text from other people and other
 * apps: rendered as text, never as markup". 41% of production messages carry
 * markdown, so this deliberately shows it raw rather than parsing it. That is
 * not an omission to fix later — RIC-1 decides the format, and until it does,
 * inventing a parser here would be the third private dialect in the workspace
 * (RFC 0.4 §14.2).
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
  className?: string
}

/**
 * The six states a foreign object has, and why they are not two.
 *
 * A gated read returns *nothing* — the same nothing as an object with no
 * content — so "you cannot see this" and "this is empty" arrive identically
 * from the relay and must never look identical on screen. `unreachable` is the
 * resolver telling us which one it was.
 */
export function ForeignObject({ object, className }: ForeignObjectProps) {
  if (object.unreachable) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-border-default bg-bg-surface p-3 text-body-2 text-text-muted',
          className,
        )}
        data-foreign-object={object.ref}
        data-state="unreachable"
      >
        You may not have access to this{object.appName ? ` ${object.appName}` : ''} object.
        {object.openUrl && (
          <>
            {' '}
            <a href={object.openUrl} className="text-text-secondary underline">
              Open it there
            </a>
            .
          </>
        )}
      </div>
    )
  }

  const widget = pickWidget(object.widget, IMPLEMENTED, 'card')
  return widget === 'message' ? (
    <ForeignMessage object={object} className={className} />
  ) : (
    <ForeignCard object={object} row={widget === 'row'} className={className} />
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
      <Avatar name={profile?.displayName} src={profile?.picture} size={20} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-caption text-text-muted">
          <span className={cn('truncate', profile?.displayName ? 'text-text-secondary' : 'text-text-muted')}>
            {profile?.displayName ?? '—'}
          </span>
        </div>
        {/* Text, never markup. See the note at the top of this file. */}
        {/*
          References are stripped from a body for the same reason as the
          description above: bech32 is not readable, and a message that is
          *only* a reference then renders as an empty line rather than a wall
          of it. Rendering the referenced object here instead is inline
          transclusion — §6 anchoring, RIC-1, deliberately not this ticket.
        */}
        {object.slots.body && stripNaddrs(object.slots.body.value).trim() && (
          <p className="whitespace-pre-wrap break-words text-body-2 text-text-primary">
            {stripNaddrs(object.slots.body.value).trim()}
          </p>
        )}
      </div>
    </div>
  )
}

function ForeignCard({ object, row, className }: ForeignObjectProps & { row?: boolean }) {
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
        {object.appName && <Chip label={object.appName} />}
      </div>
      {slots.subtitle && (
        <p className="line-clamp-2 text-body-2 text-text-secondary">{slots.subtitle.value}</p>
      )}
      {(slots.status || meta.length > 0) && (
        <div className="flex flex-wrap items-center gap-2.5 text-caption text-text-muted">
          {slots.status && (
            <StatusLabel value={slots.status.value} label={slots.status.value} size="small" />
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
      */}
      {children && children.length > 0 && (
        <div className="mt-1 flex flex-col divide-y divide-border-default border-t border-border-default">
          {children.map((child) => (
            <ForeignObject key={child.ref} object={child} />
          ))}
        </div>
      )}
      {children?.length === 0 && (
        <p className="mt-1 text-caption text-text-muted">Nothing in it yet.</p>
      )}
    </>
  )

  const shell = cn(
    'flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-3',
    row && 'py-2',
    className,
  )

  return object.openUrl ? (
    <a
      href={object.openUrl}
      className={cn(shell, 'transition-colors hover:border-border-strong')}
      data-foreign-object={object.ref}
      data-widget={row ? 'row' : 'card'}
    >
      {body}
    </a>
  ) : (
    <div className={shell} data-foreign-object={object.ref} data-widget={row ? 'row' : 'card'}>
      {body}
    </div>
  )
}
