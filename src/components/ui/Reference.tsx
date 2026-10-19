import type { MouseEvent, ReactNode } from 'react'
import { decodeNpub, stripNaddrs } from '@estiva-app/protocol'
import { InlineChip, KindIcon, WithTooltip, thingKindOf } from '@estiva-app/ui'
import type { ForeignObject } from '@/api/foreign'
import { StatusLabel } from './StatusLabel'
import { blockLinkOf, referenceLink } from '@/lib/referenceLink'
import { linkTo } from '@/router'

/**
 * What an object is called, for a chip one line high.
 *
 * Usually the title. The exception is a title that is a *person* — `as:
 * "pubkey"` on the title slot, which is how Peek's manifest titles a message,
 * by its author (RIC-11). Drawing that slot's value would draw 64 hex
 * characters, and a key is never on screen; the runtime's `people` answer it,
 * else the workspace directory, else a short key. A message then quotes its
 * opening words after the name, because "Ada" alone says nothing about which
 * of Ada's messages this is — the `message` widget is what makes it one, not
 * the person-shaped title, so a project led by somebody stays a name.
 */
function objectLabel(object: ForeignObject, nameOf?: (pubkey: string) => string): string | undefined {
  const title = object.slots.title
  if (!title) return undefined
  if (!title.isPubkey) return title.value
  const name = object.people?.[title.value]?.displayName ?? nameOf?.(title.value) ?? `${title.value.slice(0, 8)}…`
  const body = object.slots.body?.value
  const widgets = Array.isArray(object.widget) ? object.widget : [object.widget]
  return body && widgets.includes('message') ? `${name}: ${stripNaddrs(body).trim()}` : name
}

/**
 * A `nostr:` reference drawn in place — SPEC §13.1, RIC-10.
 *
 * **One component for every kind of reference, on purpose.** Miky's note is
 * that "everything you mention is basically a file. Even things like different
 * topic, message, or even specific person" — so a person and a project are the
 * same idea pointed at two things, and drawing them with two unrelated
 * mechanisms is how the display-name mention drifted away from the projection
 * layer in the first place. This replaces `MentionChip`, which knew only about
 * people.
 *
 * What it draws depends on what the URI turns out to name, not on the caller
 * knowing in advance:
 *
 * - **an `npub`** — the person, from the workspace directory
 * - **an `naddr`** — the object, from its owner's projection: the title, and
 *   the status where the manifest declares one
 * - **anything else, or nothing resolved** — the URI's own shortened form
 *
 * That last row is §13.1's rule and it is not a fallback in the apologetic
 * sense: "never blank". A reference to something outside this workspace still
 * says that a reference is there, which is the honest answer and more than the
 * old form could manage.
 *
 * **A chip that names something leads to it (RIC-16).** Miky, after the first
 * pointer mention on production: "It only creates a label, but not really a
 * link to the mentioned thing." An object chip is an anchor when
 * `referenceLink` has somewhere to send it: one of Ship's own objects opens
 * here through the router, another app's object opens at the `openUrl` its
 * manifest gave — Peek's topics and messages included — in a new tab. A
 * modified click is left to the browser either way, and the click stops at the
 * chip, because the surface under it may open on a click of its own (the
 * description's reading view enters editing) and a mention followed is not a
 * description edited. A person stays a label: Ship has no page for one.
 */
export function Reference({
  uri,
  object,
  nameOf,
  urgent,
  className,
  opensAt,
}: {
  uri: string
  /** The URL it was written as: a link to one block opens there, not at the top of its file (§13.6.1, WBM-11). */
  opensAt?: string
  /**
   * The resolved object, when the URI names one.
   *
   * Passed in rather than resolved here: a body's references are resolved once
   * for the whole body (`useForeignObjects`), so the same object cannot appear
   * in two states on one screen. `undefined` means still resolving, `null`
   * means resolved to nothing — different facts, drawn the same way, because
   * neither is something a reader can act on.
   */
  object?: ForeignObject | null
  /** The workspace directory, for a person. */
  nameOf?: (pubkey: string) => string
  /**
   * The keys the message names urgently — its `["urgent", <pubkey>]` tags
   * (SPEC §13.1). A person chip for one of them wears the urgent tone, for
   * every reader, as it did in the box it was written in (CON-24).
   */
  urgent?: readonly string[]
  className?: string
}) {
  const short = `${uri.replace(/^nostr:/, '').slice(0, 12)}…`
  // Every chip below is the package's InlineChip (UIG-27): Peek's chip, one line
  // high and level with the words around it, so a mention looks the same in both apps.

  // A person: the directory answers, or gives back a short key of its own.
  if (/^nostr:npub1/i.test(uri)) {
    let pubkey: string | null = null
    try {
      pubkey = decodeNpub(uri)
    } catch {
      pubkey = null
    }
    const name = pubkey ? nameOf?.(pubkey) : undefined
    const named = !!name && !pubkey?.startsWith(name.replace('…', ''))
    const chip = (
      <InlineChip
        tone={named ? (pubkey && urgent?.includes(pubkey) ? 'urgent' : 'person') : 'quiet'}
        data-reference="person"
        data-mention={pubkey ?? undefined}
        data-resolved={named ? 'true' : 'false'}
        className={className}
      >
        {named ? `@${name}` : (name ?? short)}
      </InlineChip>
    )
    // Nobody to name: the whole address, on hover.
    return named ? chip : <Hint label={uri}>{chip}</Hint>
  }

  // An object: whatever its owner's projection says it is.
  if (object) {
    const label = objectLabel(object, nameOf) ?? short
    const link = blockLinkOf(opensAt, referenceLink(object)?.href) ?? referenceLink(object)
    const chip = {
      tone: 'neutral' as const,
      // What it is, before its name: a topic, a project, an issue, a file or a message (Katerina, 8 October), as in Peek.
      icon: <KindIcon kind={thingKindOf(object.kind)} size={14} tone="inherit" />,
      'data-reference': 'object',
      'data-object': object.ref,
      className,
      /*
        Cut, not wrapped, and `ch` rather than pixels so it scales with the
        type. `truncate` alone did nothing here: an inline-flex chip takes
        its content's width, so an 84-character issue title — or a message,
        whose caption is a sentence (RIC-11) — became a chip as wide as the
        column. A mention is a word in a sentence; the whole title is a
        sentence of its own, and it is one hover away. Peek's chip keeps the
        same 24ch for the same reason.
      */
      style: { maxWidth: '24ch' },
    }
    const body = (
      <>
        <span className="truncate">{label}</span>
        {object.slots.status && (
          // Same call `ForeignObject` makes for the attachment variant, so the
          // two agree about what a status looks like — including the colour it
          // reads the shape from, which is the only signal of meaning that
          // crosses an app boundary (UIG-18).
          <StatusLabel
            value={object.slots.status.value}
            label={object.slots.status.value}
            colour={object.slots.status.colour}
            size="small"
            className="shrink-0"
          />
        )}
      </>
    )
    // The whole label on hover (and on focus, as a link), because the visible one is cut.
    if (!link) return <Hint label={label}><InlineChip {...chip}>{body}</InlineChip></Hint>
    const here = link.place === 'here' ? linkTo(link.href) : null
    const follow = (event: MouseEvent<HTMLAnchorElement>) => {
      event.stopPropagation()
      here?.onClick(event)
    }
    return (
      <Hint label={label}>
        {here ? (
          <InlineChip {...chip} href={here.href} onClick={follow}>
            {body}
          </InlineChip>
        ) : (
          <InlineChip {...chip} href={link.href} target="_blank" rel="noopener noreferrer" onClick={follow}>
            {body}
          </InlineChip>
        )}
      </Hint>
    )
  }

  // Still resolving, or resolved to nothing. §13.1: never blank. The whole address, on hover.
  return (
    <Hint label={uri}>
      <InlineChip tone="quiet" data-reference={object === null ? 'unresolved' : 'pending'} className={className}>
        {short}
      </InlineChip>
    </Hint>
  )
}

/**
 * The package's tooltip around a chip (UIG-14): the full words on hover, and
 * on keyboard focus for a chip that is a link, where they were a `title` only
 * a mouse could read. `inline`, because a chip is a word in a sentence and a
 * paragraph cannot hold the `<div>` wrapper; the tooltip wraps at 320px, so a
 * whole message or address stays on screen.
 *
 * The inline wrapper is pinned to the top of the line, as the chip is
 * (`align-top`, InlineChip's own alignment); the package does that itself
 * since 0.24.1. Ship used to add a span of its own for it: without it the
 * wrapper sat on the baseline, the quiet chip dropped 0.2px and its line grew
 * from 19.6px to 20px (measured).
 */
function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <WithTooltip inline label={label}>
      {children}
    </WithTooltip>
  )
}
