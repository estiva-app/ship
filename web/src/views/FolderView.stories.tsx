import type { Meta, StoryObj } from '@storybook/react-vite'
import type { FolderContents, ForeignObject } from '@/api/foreign'
import { FolderView } from './FolderView'

/**
 * Invented files from three apps, one of which nobody wrote.
 *
 * The tide reading is the point of the fixture rather than decoration: its
 * widget chain is `["tideboard", "card"]`, and no consumer implements
 * `tideboard`. RFC 0.4 §13.3 closes every chain in card/row/table/stat, so it
 * still draws — as a card, in Ship's design language, with its own app's name
 * beside it. A folder view that could only render Ship's kinds would look
 * identical until the day a third app existed.
 */
const file = (over: Partial<ForeignObject>): ForeignObject =>
  ({
    ref: 'r',
    address: 'a',
    eventId: 'e',
    kind: 30850,
    widget: 'card',
    appName: 'Estiva Ship',
    slots: {},
    meta: [],
    comments: [],
    actions: [],
    viaRecommendation: true,
    ...over,
  }) as ForeignObject

const FILES: ForeignObject[] = [
  file({ ref: 'p', kind: 30850, appName: 'Estiva Ship', slots: { title: { value: 'Payment integration' } } }),
  file({ ref: 't', kind: 39000, appName: 'Peek', slots: { title: { value: 'Onboarding' } } }),
  file({ ref: 'x', kind: 30911, appName: 'Tide table', widget: ['tideboard', 'card'], slots: { title: { value: 'Spring tides' } } }),
]

const folder = (over: Partial<FolderContents> = {}): FolderContents =>
  ({ id: '7b32200c-e4c0-4216-b79a-8490fc05e0bd', name: 'Onboarding', hasState: true, source: 'state', files: FILES, ...over }) as FolderContents

const meta = {
  title: 'Pages/FolderView',
  component: FolderView,
  args: { folder: folder() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FolderView>

export default meta
type Story = StoryObj<typeof meta>

/** Three apps' files as peers in one list, each drawn through its own manifest. */
export const ThreeApps: Story = {}

/**
 * The approximation, and it says so.
 *
 * A Folder with no state event is read by containment — each file's own `h`
 * tag — which lists Ship's records and **cannot list a topic**, because under
 * `h` a topic is the container rather than something inside it. The short list
 * is the only visible symptom, so the line under the title is the whole
 * explanation a reader gets.
 */
export const NoFolderStateYet: Story = {
  args: { folder: folder({ hasState: false, source: 'channel', files: [FILES[0]!] }) },
}

/** One file: "1 file", not "1 files". */
export const OneFile: Story = { args: { folder: folder({ files: [FILES[1]!] }) } }

/**
 * Empty, and deliberately not silent.
 *
 * Also what a Folder looks like to somebody who may not read its contents:
 * RFC 0.4 §4.2 drops files the reader cannot see rather than marking them,
 * because the count is itself the disclosure. So "nothing here" and "nothing
 * here *for you*" render identically, on purpose.
 */
export const Empty: Story = { args: { folder: folder({ files: [] }) } }

/** No name: a Folder with no state has only its channel's, and may have none. */
export const Unnamed: Story = { args: { folder: folder({ name: undefined }) } }
