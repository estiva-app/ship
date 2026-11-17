/**
 * The Journal's box (Miky, 17 Nov: "a textarea so people can quickly write an update or decision manually; better
 * than +"): the one box every app writes a comment in, estiva-ui's `CommentBox`, with Update or Decision above it.
 * What is sent joins the top of the log at once, written and added by whoever typed it: a person writing it is the
 * person accepting it.
 */
import { useState } from 'react'
import type { JSONContent } from '@tiptap/react'
import { Tabs } from '@estiva-app/ui'
import { CommentBox } from '@estiva-app/ui/editor'
import { MIKY, PEOPLE, PROJECT, TEAM, type Item } from './fixtures'

const WORDS = [
  { id: 'Update', label: 'Update' },
  { id: 'Decision', label: 'Decision' },
] as const

/** A box's document as plain lines, for the prototype's entry: the first line is its title, the rest its summary. */
function linesOf(body: JSONContent): string[] {
  const text = (n: JSONContent): string => (n.text ?? '') + (n.content ?? []).map(text).join('')
  return (body.content ?? []).map(text).map((l) => l.trim()).filter(Boolean)
}

/** Update or Decision, then the box; Send adds the entry to the top of the Journal. */
export function JournalBox({ onAdd }: { onAdd: (item: Item) => void }) {
  const [word, setWord] = useState<'Update' | 'Decision'>('Update')
  return (
    <div className="flex flex-col gap-2">
      <Tabs tabs={[...WORDS]} active={word} onChange={(id) => setWord(id as 'Update' | 'Decision')} size="small" />
      <CommentBox
        label={`Write ${word === 'Update' ? 'an update' : 'a decision'}`}
        placeholder={word === 'Update' ? 'What happened? The first line is its title.' : 'What was decided, and why? The first line is its title.'}
        people={PEOPLE.map((p) => ({ id: p.key, name: p.name }))}
        send={async (body) => {
          const [title, ...rest] = linesOf(body)
          if (!title) return { accepted: false, reason: 'empty' }
          onAdd({
            id: `typed-${Date.now()}`, type: 'journal', word, status: 'accepted', at: 'Today', day: '2026-11-17', team: TEAM, about: { kind: 'project', title: PROJECT },
            title, summary: rest.join(' ') || undefined, markedBy: MIKY, acceptedBy: MIKY, isNew: false,
          })
          return { accepted: true }
        }}
        showsAtOnce
      />
    </div>
  )
}
