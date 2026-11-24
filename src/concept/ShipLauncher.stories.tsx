import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ReactNode } from 'react'
import { Avatar, CommandPalette, CommandPaletteAnswer, CommandPaletteSearch, KindIcon, type CommandPaletteGroup } from '@estiva-app/ui'
import { IconCornerDownLeft, IconMessagePlus, IconPlus, IconRowInsertBottom } from '@tabler/icons-react'
import { RAVI } from '@/fixtures/issues'
import { Issue, Project, Topics } from '@/views/views.stories'
import { ShellSearch } from './shellSearch'

/*
  KIN-6, concept: ⌘K in Ship, for Miky's look before it is built. Ship's frame and pages as they ship (the page stories
  under Pages/In the shell); Changed from today: the search in the top bar. New here: nothing — the box is the one Peek
  and Leaf ship (@estiva-app/launcher), drawn from the kit's palette parts it is built from, in the states Ship adds:
  two words find files from every app; a sentence asks about the open issue (its text and every comment) or the open
  project (its description, its issues one line each, its own comments); an answer can be drafted as a comment or
  inserted into the description (Miky, KIN-6 kickoff, 24 Nov); Add issue and New project open Ship's own forms.
*/

type Page = 'issue' | 'project' | 'home'
type BoxState = 'closed' | 'search' | 'answer' | 'nothing-open' | 'hidden-with-answer'

const ISSUE_TITLE = 'Board columns lose order after an archived project returns'
const icon = (node: ReactNode) => node

/** Ship's own actions: Add issue in the open project, New project in a team the form asks for. */
const shipActions = (inProject: boolean): CommandPaletteGroup['rows'] => [
  { id: 'add-issue', label: 'Add issue', ...(inProject ? { description: 'In Relay Migration' } : {}), icon: icon(<IconPlus size={16} stroke={1.5} />), onSelect: () => {} },
  { id: 'new-project', label: 'New project', icon: icon(<IconPlus size={16} stroke={1.5} />), onSelect: () => {} },
]

/** Two words: files from every app, each opening where it lives, and Ship's own actions. */
const searchGroups = (inProject: boolean): CommandPaletteGroup[] => [
  {
    label: 'Files',
    rows: [
      { id: 'i', label: 'Board order after unarchive', description: 'REL-6 · Relay Migration', leading: <KindIcon kind="issue" />, onSelect: () => {} },
      { id: 'p', label: 'Board redesign', description: 'Project · Design System', leading: <KindIcon kind="project" />, onSelect: () => {} },
      { id: 'd', label: 'Board review notes', description: 'Estiva HQ · Opens in Leaf', leading: <KindIcon kind="file" />, onSelect: () => {} },
      { id: 't', label: 'Board', description: 'Topic · opens here, in Ship', leading: <KindIcon kind="topic" />, onSelect: () => {} },
    ],
  },
  { label: 'Actions', rows: shipActions(inProject) },
]

/** What an answer can become, in Ship: a comment draft, or a passage in the description. */
const next: CommandPaletteGroup = {
  label: 'Next',
  rows: [
    { id: 'comment', label: 'Draft a comment', description: 'On the passage it cites first. It will not send: edit it first.', icon: icon(<IconMessagePlus size={16} stroke={1.5} />), onSelect: () => {} },
    { id: 'insert', label: 'Insert into the description', description: 'Where your cursor was, or under the passage it cites first.', icon: icon(<IconCornerDownLeft size={16} stroke={1.5} />), onSelect: () => {} },
  ],
}

const ISSUE_ASK = {
  sentence: 'what did we find out, and who is fixing it?',
  about: ISSUE_TITLE,
  answer:
    'The cause is known: the board re-reads the team’s projects, and an archived one comes back last [2]. Ravi is fixing it with Ana tomorrow [3]. The description says what should happen: columns in the order they were left in [1].',
  groups: (): CommandPaletteGroup[] => [
    {
      label: 'Sources',
      rows: [
        { id: 's1', label: 'After an archived project is restored, the board draws its columns in the order…', description: '[1] In the description', icon: icon(<IconRowInsertBottom size={16} stroke={1.5} />), onSelect: () => {} },
        { id: 's2', label: 'Yes — it re-reads the folder union and the archived one lands last.', description: '[2] Ravi Mehta · comment', leading: <Avatar name={RAVI.name} src={RAVI.picture} size={24} />, onSelect: () => {} },
        { id: 's3', label: 'Moving this to in progress. Will pair with Ana on the fix tomorrow.', description: '[3] Ravi Mehta · comment', leading: <Avatar name={RAVI.name} src={RAVI.picture} size={24} />, onSelect: () => {} },
      ],
    },
    next,
    { label: 'Suggested', rows: shipActions(true) },
  ],
}

const PROJECT_ASK = {
  sentence: 'what is still open here, and who is it waiting on?',
  about: 'Relay Migration',
  answer:
    'Four issues are open. Two are in progress: board order after unarchive, with Ana [1], and comments losing their draft, with Ravi [2]. Two are still to do: the dark theme accent, with Mara [3], and a keyboard path for status, with Ana [4].',
  groups: (): CommandPaletteGroup[] => [
    {
      label: 'Sources',
      rows: [
        { id: 'p1', label: 'Board columns lose order after an archived project returns', description: '[1] REL-1 · In Progress · Ana Duarte', leading: <KindIcon kind="issue" />, onSelect: () => {} },
        { id: 'p2', label: 'Comments lose their draft when navigating away', description: '[2] REL-2 · In Progress · Ravi Mehta', leading: <KindIcon kind="issue" />, onSelect: () => {} },
        { id: 'p3', label: 'Pick the dark theme accent', description: '[3] REL-3 · Todo · Mara Sato', leading: <KindIcon kind="issue" />, onSelect: () => {} },
        { id: 'p4', label: 'Add a keyboard path for changing status from the list', description: '[4] REL-4 · Todo · Ana Duarte', leading: <KindIcon kind="issue" />, onSelect: () => {} },
      ],
    },
    next,
    { label: 'Suggested', rows: shipActions(true) },
  ],
}

/** Ship's page with the search in its bar, and the ⌘K box in one of its states over it. */
function ShipWithLauncher({ page, state }: { page: Page; state: BoxState }) {
  const [open, setOpen] = useState(state !== 'closed' && state !== 'hidden-with-answer')
  const ask = page === 'project' ? PROJECT_ASK : ISSUE_ASK
  const asking = state === 'answer' || state === 'hidden-with-answer'
  const [query, setQuery] = useState(state === 'search' ? 'board or' : state === 'nothing-open' ? 'what changed this week?' : ask.sentence)
  const hiddenAnswer = !open && state === 'hidden-with-answer'
  // The page as its own story draws it (Pages/In the shell), as a component so its hooks are its own.
  const Body = (page === 'issue' ? Issue : page === 'project' ? Project : Topics).render as unknown as () => ReactNode
  return (
    <ShellSearch.Provider
      value={{ onSearch: () => setOpen(true), searchPlaceholder: 'Search Ship...', ...(hiddenAnswer ? { searchStatus: 'waiting', searchStatusLabel: 'An answer is waiting' } : {}) }}
    >
      <Body />
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        label="Launcher"
        where={page === 'home' ? 'Anywhere in Ship' : page === 'project' ? 'In this project' : 'In this issue'}
        escWord={state === 'search' ? 'close' : 'hide'}
      >
        <CommandPaletteSearch
          query={query}
          onQueryChange={setQuery}
          placeholder={page === 'home' ? 'Search Ship' : `Search, or ask about this ${page}`}
          groups={state === 'search' ? searchGroups(page !== 'home') : asking ? ask.groups() : [{ label: 'Suggested', rows: shipActions(false) }]}
          {...(state === 'nothing-open' ? { notes: ['Open an issue or project to ask about it.'] } : {})}
          {...(state !== 'search' ? { prompt: { onSubmit: () => {}, submitWord: 'ask' } } : {})}
          {...(asking ? { about: ask.about } : {})}
        >
          {asking ? <CommandPaletteAnswer>{ask.answer}</CommandPaletteAnswer> : undefined}
        </CommandPaletteSearch>
      </CommandPalette>
    </ShellSearch.Provider>
  )
}

const meta = {
  title: 'Concept/Search and ask in Ship (KIN-6)',
  component: ShipWithLauncher,
  parameters: { layout: 'fullscreen' },
  args: { page: 'issue', state: 'closed' },
  argTypes: {
    page: { control: 'inline-radio', options: ['issue', 'project', 'home'] },
    state: { control: 'inline-radio', options: ['closed', 'search', 'answer', 'nothing-open', 'hidden-with-answer'] },
  },
} satisfies Meta<typeof ShipWithLauncher>

export default meta
type Story = StoryObj<typeof meta>

/** Changed from today: the top bar has a search, "Search Ship...", and Ctrl+K opens it. Click it to open the box. */
export const SearchInTheBar: Story = {}

/** Two words: files from every app — an issue or project opens here, a Leaf page in Leaf, a topic on Ship's own topic page — and Add issue, New project. */
export const TwoWords: Story = { args: { state: 'search' } }

/** A sentence about the open issue: the answer reads its description and every comment, cites both, and can be drafted as a comment or inserted into the description. */
export const AskAboutTheIssue: Story = { args: { state: 'answer' } }

/** A sentence about the open project: the answer reads its description, its issues one line each and its own comments. */
export const AskAboutTheProject: Story = { args: { page: 'project', state: 'answer' } }

/** On a page with no issue or project open (Explore initiatives): a sentence has nothing to be about, and the box says so. */
export const NothingOpen: Story = { args: { page: 'home', state: 'nothing-open' } }

/** Escape hides the box and keeps the sentence and the answer; the search carries a dot until you have seen the answer. */
export const HiddenWithAnAnswer: Story = { args: { state: 'hidden-with-answer' } }
