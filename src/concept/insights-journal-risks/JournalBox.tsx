/**
 * The Journal's box (Miky, 17 Nov): a box to write an update or a decision in, not a +; and, from Linear's project
 * update box, the toggle inside the box itself, at its top, with the text under it and the button at its foot.
 *
 * New here: the shared comment box (estiva-ui's `CommentBox`) has no place inside its frame for a toggle, so the
 * prototype draws the frame from a Card. The build gives `CommentBox` that place (an estiva-ui change), and this file
 * goes. What is sent joins the top of the log at once, added by whoever wrote it.
 */
import { useState } from 'react'
import { Button, Card, Form, Tabs, Textarea } from '@estiva-app/ui'
import { MIKY, PROJECT, TEAM, type Item } from './fixtures'

type Word = 'Update' | 'Decision'
const WORDS: { id: Word; label: string }[] = [
  { id: 'Update', label: 'Update' },
  { id: 'Decision', label: 'Decision' },
]

/** Update or Decision inside the box, then the text; Post (or Enter) adds it to the top of the Journal. */
export function JournalBox({ onAdd }: { onAdd: (item: Item) => void }) {
  const [word, setWord] = useState<Word>('Update')
  const [text, setText] = useState('')
  const post = () => {
    const [title, ...rest] = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!title) return
    onAdd({
      id: `typed-${Date.now()}`, type: 'journal', word, status: 'accepted', at: 'Today', day: '2026-11-17', team: TEAM, about: { kind: 'project', title: PROJECT },
      title, summary: rest.join(' ') || undefined, markedBy: MIKY, acceptedBy: MIKY, isNew: false,
    })
    setText('')
  }
  return (
    <Card fill="surface" className="p-3">
      {/* The kit's keys: Enter is a new line in the text, Ctrl+Enter or the button posts it. */}
      <Form onSubmit={post} layout="free">
        <span className="flex flex-col gap-2">
          <span className="flex">
            <Tabs tabs={WORDS} active={word} onChange={setWord} size="small" />
          </span>
          {/* @estiva-escape(no-restyled-part): prototype of CommentBox with its toggle inside the frame (New here); the build moves it into estiva-ui and this Textarea goes. */}
          <Textarea
            aria-label={word === 'Update' ? 'Write an update' : 'Write a decision'}
            className="min-h-16 border-0 bg-transparent px-1 shadow-none focus:ring-0"
            placeholder={word === 'Update' ? 'Write an update… the first line is its title' : 'Write a decision… the first line is its title'}
            value={text}
            rows={3}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="flex justify-end">
            <Button type="submit" variant="outlined" size="small" disabled={!text.trim()}>
              {word === 'Update' ? 'Post update' : 'Post decision'}
            </Button>
          </span>
        </span>
      </Form>
    </Card>
  )
}
