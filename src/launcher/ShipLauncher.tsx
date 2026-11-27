import { useEffect, useReducer } from 'react'
import { IconCornerDownLeft, IconMessagePlus, IconPlus } from '@tabler/icons-react'
import {
  CommandLauncher,
  launcherApps,
  onDeviceModel,
  type KeptLauncherBox,
  type LauncherAnswer,
  type LauncherAnswerAction,
  type LauncherContext,
  type LauncherFileHit,
  type LauncherHost,
  type LauncherPerson,
  type LauncherWords,
} from '@estiva-app/launcher'
import { encodeNpub, KIND as WIRE } from '@estiva-app/protocol'
import { LinkCard, thingKindOf } from '@estiva-app/ui'
import { KIND } from '@/nostr/kinds'
import { applyCreation, creatableUnder, resolveForeign, shipMaySign } from '@/api/foreign'
import { fileHits, fileSections, REFERENCE_COPY, subscribeFileHits, subscribeReferences } from '@/api/references'
import { DescriptionLink } from '@/components/editing/descriptionLinks'
import { useMentionPeople } from '@/components/editing/mentionables'
import { useForeignObjects } from '@/api/useForeignObjects'
import { referenceOfValue } from '@/components/conversations/shared'
import { useReportFailure } from '@/lib/failureReports'
import { dOf } from '@/lib/fileLinks'
import { linkStateOf } from '@/lib/linked'
import { isSiblingHost, isTopicAddress, topicHref } from '@/lib/topicLinks'
import { go, navigateTo, useRoute } from '@/router'
import { askForm, formHere } from './forms'
import { blockOfPart, cursorBlockAtOpen, draftComment, insertIntoDescription, openFileNow, PASSAGE, showPart } from './openFile'

/*
  KIN-6 — Ship's ⌘K: the box Peek and Leaf ship (@estiva-app/launcher), handed what only Ship knows. A name finds files
  from every app; a sentence asks about the open issue or project; an answer becomes a comment or a passage in its
  description (Miky, KIN-6 kickoff). Add issue and New project open Ship's own forms, not the package's.
*/

const WORDS: LauncherWords = {
  anywhere: 'Anywhere in Ship',
  inOpen: 'In this issue or project',
  search: 'Search Ship',
  searchOrAsk: 'Search Ship',
  openGroup: 'Open here',
  nothingOpen: 'Open an issue or project to ask about it.',
  nothingYet: 'Nothing has been written here yet.',
  reading: 'Reading it…',
  downloadModel: 'Download the on-device model to ask about issues and projects',
  part: { one: 'part', many: 'parts' },
}

/** The words for what is open, as the approved story says them: "In this issue", "ask about this project" (as Leaf's "this page"). */
const wordsFor = (kind: 'issue' | 'project' | undefined): LauncherWords =>
  kind ? { ...WORDS, inOpen: `In this ${kind}`, searchOrAsk: `Search, or ask about this ${kind}` } : WORDS

// Ship as the host, without the package's own Create issue form: ⌘K's Add issue opens Ship's (Done when, KIN-6).
// And each app with an action Ship may sign, as Leaf's box lists them: Leaf, for the New document its manifest declares
// on a team (KIN-9).
const APPS = launcherApps('ship')
  .filter((app) => app.isHost || app.actions.some((action) => typeof action.emits?.kind === 'number' && shipMaySign(action.emits.kind)))
  .map((app) => (app.isHost ? { ...app, actions: [] } : app))
const IDLE = { state: { kind: 'idle' } as const, hits: [] as LauncherFileHit[] }

const kindOf = (address: string) => Number(address.split(':')[0])

/** What `[` finds, as the box's file search: files from every app by the words of their fields. */
function useShipFileSearch(query: string): ReturnType<LauncherHost['useFileSearch']> {
  const [, answered] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeFileHits(answered), [])
  const typed = query.trim()
  if (typed.length < 2) return IDLE
  const hits = fileHits(typed).map(({ id, title, summary, caption }) => {
    // A Leaf page opens in Leaf: its row says so before the person leaves Ship.
    const away = kindOf(id) === WIRE.DOCUMENT ? 'Opens in Leaf' : undefined
    const where = [caption, away].filter(Boolean).join(' · ')
    return { id, title, ...(summary ? { summary } : {}), ...(where ? { caption: where } : {}) }
  })
  return { state: { kind: 'done', count: hits.length }, hits }
}

/**
 * Where a file opens: an issue or a project here, a topic on Ship's own topic page (which sends a space on to Peek),
 * anything else in its own app, from its manifest's address, and only on Estiva's own hosts beside Ship: any key can
 * publish a manifest until WOR-2, so a planted address never takes the tab elsewhere (as Leaf, KIN-5).
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/a-link-opens-in-the-app-you-are-in-when-it-has-a-page-made-for-that-kind.md
 */
export function openFile(
  address: string,
  title: string,
  cannot: () => void,
  leave: (url: string) => void = (url) => window.location.assign(url),
  here: string = window.location.hostname,
): void {
  const kind = kindOf(address)
  if (kind === KIND.ISSUE) return go({ name: 'issue', d: dOf(address), slug: title })
  if (kind === KIND.PROJECT) return go({ name: 'project', d: dOf(address), slug: title, view: 'table' })
  if (isTopicAddress(address)) return navigateTo(topicHref(address, title))
  void resolveForeign(address)
    .catch(() => null)
    .then((file) => {
      const away = file?.openUrl
      if (away && /^https:/.test(away) && isSiblingHost(away, here)) leave(away)
      else cannot()
    })
}

/** The card a link to the file draws, beside the box while its row is lit. */
function FilePreview({ address }: { address: string }) {
  const uri = referenceOfValue(address) ?? address
  const objects = useForeignObjects([uri])
  const object = objects?.[0]
  return <LinkCard link={object === undefined ? { state: 'loading', kind: thingKindOf(kindOf(address)) } : linkStateOf(uri, object)} bare readOnly />
}

/** A person's DM is Peek's: on Ship's sibling host, Peek's. */
function openPerson(pubkey: string): void {
  const peek = window.location.origin.replace(/\/\/ship\./, '//peek.')
  if (peek !== window.location.origin) window.location.assign(`${peek}/app/dms/${encodeURIComponent(pubkey)}`)
}

/** What an answer about the open issue or project can become here: a new comment, or a passage in its description. */
function answerActions(answer: LauncherAnswer): LauncherAnswerAction[] {
  const open = openFileNow()
  if (!open) return []
  const first = answer.cited[0]
  const block = first ? blockOfPart(first) : null
  const passage = answer.cited.find((part) => part.where === PASSAGE)
  // Where you were writing; else under the passage it cites first; else under the block its first comment is on; else at the end.
  const cursor = cursorBlockAtOpen()
  const after = cursor ?? (passage ? passage.id : block)
  // A row that cannot succeed is not offered: an archived or read-only file takes neither.
  return [
    ...(open.canComment
      ? [
          {
            id: 'comment',
            label: 'Draft a comment',
            description: 'It will not send. Edit it first.',
            icon: <IconMessagePlus size={16} stroke={1.5} />,
            run: () => draftComment(answer.text, block),
          },
        ]
      : []),
    ...(open.canEdit
      ? [
          {
            id: 'insert',
            label: 'Insert into the description',
            description: cursor
              ? 'Where your cursor was.'
              : passage
                ? 'Under the passage it cites first.'
                : after
                  ? 'Under the passage its first comment is on.'
                  : 'At the end of the description.',
            icon: <IconCornerDownLeft size={16} stroke={1.5} />,
            run: () => insertIntoDescription(answer.text, after),
          },
        ]
      : []),
  ]
}

/** `[` in a form's text: what a description's `[` offers. */
const FORM_REFERENCES: LauncherHost['form']['references'] = { sections: fileSections, subscribe: subscribeReferences, ariaLabel: REFERENCE_COPY.files, sectionLabel: REFERENCE_COPY.files }

/**
 * What the box's form needs of Ship, for another app's creation (KIN-9: Leaf's New document): `[` and `@` in its text
 * as a description has them, and a link drawn as a description draws it. Ship's own Add issue and New project are its
 * dialogs. The form asks for no person, so there is no picker.
 */
function useShipForm(): LauncherHost['form'] {
  const people = useMentionPeople()
  return {
    references: FORM_REFERENCES,
    mentions: { people: () => people, uriOf: (person) => (person.pubkey ? `nostr:${encodeNpub(person.pubkey)}` : null) },
    referenceView: DescriptionLink,
    personField: () => null,
  }
}

/** Ship's ⌘K box, held by the frame (`useKeptLauncher`). */
export function ShipLauncher({ people, say, ...box }: KeptLauncherBox<LauncherContext> & { people: readonly LauncherPerson[]; say: (text: string) => void }) {
  const route = useRoute()
  const open = openFileNow()
  const form = useShipForm()
  const host: LauncherHost = {
    apps: APPS,
    mark: () => null,
    words: wordsFor(open?.kind),
    path: { pathname: window.location.pathname, search: window.location.search },
    navigate: navigateTo,
    // A person opens in Peek beside Ship; where there is none to find (a preview, localhost), no person is offered.
    people: /\/\/ship\./.test(window.location.origin) ? people : [],
    openPerson,
    file: {
      glyph: (id) => thingKindOf(kindOf(id)),
      open: (id, title) => openFile(id, title, () => say(`${title || 'That file'} cannot be opened from Ship.`)),
      isOpen: (id) => (route.name === 'issue' || route.name === 'project') && route.d === dOf(id),
      preview: (id) => (isTopicAddress(id) ? null : <FilePreview address={id} />),
    },
    useFileSearch: useShipFileSearch,
    plain: (body) => body,
    // Another app's creation on a team, made in Ship (KIN-9): Leaf's New document.
    manifests: { creatableUnder, applyAction: applyCreation, resolveObject: async () => null },
    model: onDeviceModel,
    showSource: showPart,
    form,
    // Ship signs its projects and issues, and a Leaf document its ⌘K makes (Estiva ID's allowed kinds for Ship).
    maySign: shipMaySign,
    // A New document starts in the team of the issue or project you are on.
    currentFolder: () => open?.team,
    ownActions: [
      {
        id: 'add-issue',
        label: 'Add issue',
        // Said only where this page's form takes it there: an archived project's issue goes to the Issues page's form.
        ...(open?.project && formHere('issue') ? { description: `In ${open.project.title}` } : {}),
        // What the on-device guess reads, never drawn: the wording probed in Edge on 24 Nov (KIN-7).
        guessAs: 'Add a new issue, bug or ticket',
        icon: <IconPlus size={16} stroke={1.5} />,
        run: () => askForm('issue', () => go({ name: 'issues' })),
      },
      {
        id: 'new-project',
        label: 'New project',
        guessAs: 'Create a new project',
        icon: <IconPlus size={16} stroke={1.5} />,
        run: () => askForm('project', () => go({ name: 'projects' })),
      },
    ],
    answerActions,
    useReportFailure,
  }
  return <CommandLauncher host={host} {...box} />
}
