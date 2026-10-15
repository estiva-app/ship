/**
 * Widgets 2, in Ship (WID-3): every place a link draws in Ship, by where it
 * sits (why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/where-a-link-sits-decides-how-it-draws.md).
 *
 * - In a comment: a chip in a sentence, a row alone on its line, and the one
 *   file's card under it, which the author removes with ✕.
 * - In the comment box: a lone link is a row as you write, and the one file's
 *   card shows under the box with its ✕, before you send.
 * - In a description: chip, row, and the chip menu switching a lone link to its
 *   card in that line's place; the `/` menu's widget entry.
 * - Under "Mentioned in".
 *
 * The widgets come from the ui kit's `concept` prerelease, one copy for every
 * app; the frames are Ship's own, redrawn from their class lists (IssueView's
 * column, ThreadList's thread card and message, MessageBox's writing box).
 * Prototype only: lives on `concept/widgets-2` and is never merged.
 */
import { Avatar, Card, IconButton, TooltipProvider } from '@estiva-app/ui'
import {
  ChipMenu,
  ISSUE,
  LinkPicker,
  MESSAGE,
  PAGE,
  PlacedDocument,
  PlacedLines,
  PlacedMessage,
  PROJECT,
  SentMessage,
  SlashMenuWithLink,
  TOPIC,
  CardUnder,
  cardFileOf,
  type Line,
  type Thing,
} from '@estiva-app/ui/widgets-2'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconArrowUp, IconBox, IconPaperclip } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { AppSection, Centred } from '@/components/layout/ReadingColumn'
import { WRITING_BOX } from '@/components/conversations/writingBox'
import { cn } from '@/lib/cn'

const loading = (thing: Thing): Thing => ({ ...thing, state: 'loading' })
const unavailable = (thing: Thing): Thing => ({ ...thing, state: 'unavailable' })

/** IssueView's reading column, as the Overview and Activity tabs draw it. */
function IssueColumn({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col px-6 pb-5">
      <Centred>{children}</Centred>
    </div>
  )
}

/** ThreadList's message: the author line, then the body. */
function Comment({ name = 'Person Two', at = '10:42', children }: { name?: string; at?: string; children: ReactNode }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="flex min-h-6 items-center gap-2">
        <Avatar size={20} name={name} />
        <span className="truncate text-body-2-strong text-text-primary">{name}</span>
        <span className="text-caption text-text-muted">{at}</span>
      </div>
      {children}
    </article>
  )
}

/** ThreadList's thread card. */
function Thread({ children }: { children: ReactNode }) {
  return (
    <Card fill="surface" className="flex flex-col gap-3 px-4 py-3">
      {children}
    </Card>
  )
}

/** MessageBox's tall box for a new conversation: the text, then Attach and Send on a row under it. The one file's card goes under the box. */
function CommentBox({ lines, card, onRemove, onSend }: { lines: Line[]; card?: Thing; onRemove?: () => void; onSend?: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={cn(WRITING_BOX, 'flex-col gap-4')}>
        <div className="min-h-5">{lines.length > 0 && <PlacedLines lines={lines} />}</div>
        <div className="flex items-center justify-end gap-1">
          <IconButton aria-label="Attach a file" tooltip="Attach a file">
            <IconPaperclip size={16} stroke={1.5} />
          </IconButton>
          <IconButton variant="primary" aria-label="Send" tooltip="Send" glow={lines.length > 0} disabled={!lines.length} onClick={onSend}>
            <IconArrowUp size={16} stroke={1.5} />
          </IconButton>
        </div>
      </div>
      {card && <CardUnder thing={card} onRemove={onRemove} className="max-w-[480px]" />}
    </div>
  )
}

const meta = {
  title: 'Widgets 2/In Ship',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Comments as they draw: the one file's card under each, no row for that file, a chip in a sentence still drawn; two files, no card; an old `compact` message as it draws now. Hover a card you wrote for its ✕. */
export const InAComment: Story = {
  render: () => (
    <IssueColumn>
      <AppSection title="Conversations">
        <Thread>
          <Comment>
            <SentMessage lines={[['Some words before a link to ', ISSUE, ', and the sentence goes on after it.']]} />
          </Comment>
        </Thread>
        <Thread>
          <Comment name="Person One" at="10:44">
            <SentMessage lines={[['Words on the line above the link.'], PROJECT, ['Words on the line under it.']]} />
          </Comment>
        </Thread>
        <Thread>
          <Comment at="10:51">
            <SentMessage lines={[MESSAGE]} />
          </Comment>
        </Thread>
        <Thread>
          <Comment name="Person One" at="11:02">
            <PlacedMessage lines={[['Two files, so no card: ', ISSUE, ' and the other one,'], TOPIC]} />
          </Comment>
        </Thread>
        <Thread>
          <Comment at="Yesterday">
            <PlacedMessage lines={[['An old message, sent with a compact row for ', ISSUE, '.']]} oldCompact={[ISSUE]} />
          </Comment>
        </Thread>
      </AppSection>
    </IssueColumn>
  ),
}

/** Still loading and not available to this reader, in a comment and in the card under it. */
export const InACommentLoading: Story = {
  render: () => (
    <IssueColumn>
      <AppSection title="Conversations">
        <Thread>
          <Comment>
            <PlacedMessage lines={[['A link still loading: ', loading(ISSUE), '.']]} />
          </Comment>
        </Thread>
        <Thread>
          <Comment name="Person One">
            <PlacedMessage lines={[['A link this reader cannot open: ', unavailable(PROJECT), '.']]} />
          </Comment>
        </Thread>
      </AppSection>
    </IssueColumn>
  ),
}

/** The comment box, live: the lone link is a row as you write, its card shows under the box. ✕ takes the card away; Send puts the comment above, card and all. */
export const InTheCommentBox: Story = {
  render: function Render() {
    const lines: Line[] = [['Words on the line above the link.'], ISSUE]
    const [removed, setRemoved] = useState(false)
    const [sent, setSent] = useState<{ removed: boolean } | null>(null)
    return (
      <IssueColumn>
        <AppSection title="Conversations">
          {sent && (
            <Thread>
              <Comment name="Person One" at="Now">
                <SentMessage lines={lines} key={String(sent.removed)} />
              </Comment>
            </Thread>
          )}
          {sent ? (
            <CommentBox lines={[]} />
          ) : (
            <CommentBox
              lines={lines}
              card={removed ? undefined : cardFileOf(lines)}
              onRemove={() => setRemoved(true)}
              onSend={() => setSent({ removed })}
            />
          )}
        </AppSection>
      </IssueColumn>
    )
  },
}

/** The comment box after ✕: no card is sent. */
export const InTheCommentBoxCardRemoved: Story = {
  render: () => (
    <IssueColumn>
      <AppSection title="Conversations">
        <CommentBox lines={[['Words before a link to ', ISSUE, ', the card removed with ✕.']]} />
      </AppSection>
    </IssueColumn>
  ),
}

/** The comment box with a second file linked: two files, so no card. */
export const InTheCommentBoxTwoFiles: Story = {
  render: () => (
    <IssueColumn>
      <AppSection title="Conversations">
        <CommentBox lines={[['Words before a link to ', ISSUE, ' and the second one:'], PROJECT]} />
      </AppSection>
    </IssueColumn>
  ),
}

/** After sending, as the author sees it: the card with its ✕ on hover. To anyone else, no ✕. */
export const SentAsTheAuthor: Story = {
  render: () => (
    <IssueColumn>
      <AppSection title="Conversations">
        <Thread>
          <Comment name="Person One" at="Now">
            <PlacedMessage lines={[['Words on the line above the link.'], ISSUE]} onRemove={() => {}} />
          </Comment>
        </Thread>
        <Thread>
          <Comment name="Person One" at="Now">
            <PlacedMessage lines={[['Words on the line above the link.'], ISSUE]} removed />
          </Comment>
        </Thread>
      </AppSection>
    </IssueColumn>
  ),
}

const DESCRIPTION: Line[] = [
  ['Some words before a link to ', PROJECT, ', and the sentence goes on after it, as a chip.'],
  ISSUE,
  ['A line of words with no link at all, between the rows.'],
  TOPIC,
  PAGE,
]

/** An issue's description: chips in sentences, a row for each link alone on its line. Click a row for its menu, then choose Card: it takes that line's place. */
export const InADescription: Story = {
  render: () => (
    <IssueColumn>
      <div className="flex flex-col gap-4">
        <h1 className="-mx-2 px-2 py-1 text-h2 text-text-primary">Item two</h1>
        <div className="-mx-2 px-2 py-1">
          <PlacedDocument lines={DESCRIPTION} />
        </div>
      </div>
    </IssueColumn>
  ),
}

/** The chip menu on a lone-line link in a description, and the card it switches to. */
export const InADescriptionChipMenu: Story = {
  render: () => (
    <IssueColumn>
      <div className="flex flex-col gap-4">
        <h1 className="-mx-2 px-2 py-1 text-h2 text-text-primary">Item two</h1>
        <div className="-mx-2 px-2 py-1">
          <PlacedLines
            lines={[['Words before the link.'], ISSUE, ['Words between.'], PROJECT, ['Words after.']]}
            cards={[3]}
            onLink={() => {}}
            under={(i) =>
              i === 1 ? (
                <div className="absolute left-0 top-full z-10 mt-1">
                  <ChipMenu thing={ISSUE} />
                </div>
              ) : null
            }
          />
        </div>
      </div>
    </IssueColumn>
  ),
}

/** The `/` menu in a description, with its widget entry (Miky's QA note), and the list it opens. */
export const InADescriptionSlashMenu: Story = {
  render: () => (
    <IssueColumn>
      <div className="flex flex-col gap-4">
        <h1 className="-mx-2 px-2 py-1 text-h2 text-text-primary">Item two</h1>
        <div className="-mx-2 flex gap-6 px-2 py-1">
          <div className="relative flex-1">
            <p className="text-body-2 text-text-secondary">/</p>
            <div className="absolute left-0 top-full z-10 mt-1">
              <SlashMenuWithLink />
            </div>
          </div>
          <div className="relative flex-1">
            <p className="text-body-2 text-text-primary">[ite</p>
            <div className="absolute left-0 top-full z-10 mt-1">
              <LinkPicker files={[ISSUE, PROJECT, TOPIC, MESSAGE, PAGE]} query="ite" />
            </div>
          </div>
        </div>
      </div>
    </IssueColumn>
  ),
}

/** "Mentioned in" on an issue's Activity tab: the place each conversation lives, then the conversation, its links drawn the same way. */
export const MentionedIn: Story = {
  render: () => (
    <IssueColumn>
      <AppSection title="Mentioned in">
        <ol className="flex flex-col gap-3">
          <li className="flex flex-col gap-1.5">
            <p className="flex min-w-0 items-center gap-1.5 text-caption text-text-muted">
              <span className="flex shrink-0">
                <IconBox size={14} stroke={1.5} />
              </span>
              <span className="truncate">Group one</span>
            </p>
            <Thread>
              <Comment>
                <PlacedMessage lines={[['Some words before a link to ', ISSUE, ', and the sentence goes on after it.']]} />
              </Comment>
            </Thread>
          </li>
          <li className="flex flex-col gap-1.5">
            <p className="flex min-w-0 items-center gap-1.5 text-caption text-text-muted">
              <span className="flex shrink-0">
                <IconBox size={14} stroke={1.5} />
              </span>
              <span className="truncate">Group one</span>
            </p>
            <Thread>
              <Comment name="Person One" at="Yesterday">
                <PlacedMessage lines={[['Two links: ', ISSUE, ' and'], PAGE]} />
              </Comment>
            </Thread>
          </li>
        </ol>
      </AppSection>
    </IssueColumn>
  ),
}
