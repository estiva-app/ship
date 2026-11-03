import { useState } from 'react'
import { MembersDialog, MembersPill, type MembersDialogCandidate, type MembersDialogMember } from '@estiva-app/ui'
import type { WorkspacePerson } from './PageFields'

/** How many faces the pill draws; the count says the rest. */
const PILL_FACES = 3

export interface MembersProps {
  /** The file's members by key (SPEC §11.8). `undefined` until the first read: nothing is drawn rather than a wrong count. */
  members: ReadonlyMap<string, unknown> | undefined
  /** The viewer's key. */
  me: string
  /** Names and faces by key — the workspace's people, who are also who "Add members" offers. */
  people: WorkspacePerson[]
  /** A key's name when it is not among `people`. */
  nameOf: (pubkey: string) => string
  /** A key's face when it is not among `people`: its picture, and whether it is an agent's. */
  personOf: (pubkey: string) => { picture?: string; bot?: boolean }
  /** Who holds a part in the file — "Assignee", "Author", "Lead" — drawn as the row's second line, and listed "· not following" once they have left. */
  roles: { pubkey: string; role: string }[]
  /** One line under the roster. */
  note?: string
  /** Why the viewer cannot change membership here: no Join, Leave or Add is offered. */
  readOnlyReason?: string
  /** Join (`true`) or leave (`false`). Resolves `true` once the relay has taken it. */
  onSetMine: (member: boolean) => Promise<boolean>
  /** Add these people. Resolves `true` once the relay has taken every one. */
  onAdd: (pubkeys: string[]) => Promise<boolean>
}

/**
 * Who is in an issue or a project: the members pill for the page's header, and
 * the Members dialog it opens, with Join or Leave for the viewer and "Add
 * members" (SHI-31; the old Peek design, Miky 2026-10-06). Ship's part is which
 * people, what their second line says, and the writes.
 */
export function Members({ members, me, people, nameOf, personOf, roles, note, readOnlyReason, onSetMine, onAdd }: MembersProps) {
  const [open, setOpen] = useState(false)
  if (!members) return null

  const byKey = new Map(people.map((p) => [p.value, p]))
  const person = (pubkey: string): WorkspacePerson => {
    const known = byKey.get(pubkey)
    if (known) return known
    const { picture, bot } = personOf(pubkey)
    return { value: pubkey, name: nameOf(pubkey), picture, ...(bot ? { bot } : {}) }
  }
  const rolesOf = (pubkey: string) => roles.filter((r) => r.pubkey === pubkey).map((r) => r.role)
  const named = (pubkey: string) => (pubkey === me ? 'You' : person(pubkey).name)

  // You first, then by name; then whoever holds a part but has left, so a missed comment has its reason on screen.
  const keys = [...members.keys()].sort((a, b) => Number(b === me) - Number(a === me) || named(a).localeCompare(named(b)))
  const left = [...new Set(roles.map((r) => r.pubkey))].filter((pubkey) => !members.has(pubkey)).sort((a, b) => named(a).localeCompare(named(b)))
  const rows: MembersDialogMember[] = [
    ...keys.map((pubkey) => ({ id: pubkey, name: named(pubkey), picture: person(pubkey).picture, bot: person(pubkey).bot, caption: rolesOf(pubkey).join(' · ') || undefined })),
    // Their own id, so the picker (which leaves out rows by id) still offers them: anyone may add back somebody who left (Miky, 2026-10-07).
    ...left.map((pubkey) => ({ id: `left:${pubkey}`, name: named(pubkey), picture: person(pubkey).picture, bot: person(pubkey).bot, caption: `${rolesOf(pubkey).join(' · ')} · not following` })),
  ]
  const candidates: MembersDialogCandidate[] = people.map((p) => ({ id: p.value, label: p.value === me ? 'You' : p.name, picture: p.picture, bot: p.bot }))
  const isMember = members.has(me)
  const canChange = !readOnlyReason

  return (
    <>
      <MembersPill
        members={keys.slice(0, PILL_FACES).map((pubkey) => ({ name: named(pubkey), picture: person(pubkey).picture, bot: person(pubkey).bot }))}
        count={members.size}
        onClick={() => setOpen(true)}
      />
      {open && (
        <MembersDialog
          members={rows}
          count={members.size}
          self={canChange ? { action: isMember ? 'leave' : 'join', onToggle: () => onSetMine(!isMember), id: me } : undefined}
          candidates={candidates}
          onAdd={canChange && isMember ? async (chosen) => onAdd(chosen.map((c) => c.id)) : undefined}
          note={note}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
