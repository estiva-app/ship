/**
 * Ship, as an agent reads it.
 *
 * The per-app half of the seam in `../cli.ts`. Everything that knows Ship has
 * projects, issues and change events lives here; nothing generic knows any of
 * it. A second app is a sibling of this file, not a fork of the runner.
 *
 * It reads through `Store` and `foldFolder` rather than querying the relay
 * directly, deliberately. The fold is the part with the subtle rules in it —
 * change ordering, re-linked Folders, a status set by somebody who did not
 * author the issue — and an agent that reimplemented any of that would drift
 * from what the app shows a person. The whole value of this CLI is that it and
 * `ship.estiva.app` agree.
 */
import { Store, nextRef, refPrefix } from '../../../src/store'
import type { Issue, Project } from '../../../src/fold'
import { conversationsAbout } from '../../../src/fold'
import {
  DEFAULT_ISSUE_STATUS,
  ISSUE_STATUSES,
  KIND,
  PROJECT_STATUSES,
  lookupStatus,
} from '../../../src/kinds'
import type { Directory } from '../../../src/profiles'
import { BadRequest, flagValue, type AgentApp, type AgentContext } from '../cli'
import { resolveOne } from '../resolve'

const store = (context: AgentContext) => new Store(context.relay, context.signer)

/** A pubkey as something a person can read, falling back to a short hex. */
function who(directory: Directory, pubkey: string | undefined): string | undefined {
  if (!pubkey) return undefined
  const profile = directory.get(pubkey)
  return profile?.name ?? `${pubkey.slice(0, 8)}…`
}

/**
 * A change value that is a public key, rendered as a name.
 *
 * `assignee` changes carry a pubkey in `value`, so resolving only the actor
 * leaves "Claude set assignee to b38fd268…" — half a sentence. Matched on shape
 * rather than on field name so the next field carrying a key is covered without
 * anybody remembering to add it.
 *
 * A key nobody has a profile for stays as it is: an unnamed participant is
 * unnamed, and inventing something would be worse than the hex.
 */
export function resolvePubkeys(directory: Directory, value: string): string {
  if (!/^[0-9a-f]{64}$/i.test(value.trim())) return value
  const profile = directory.get(value.trim().toLowerCase())
  return profile?.name ?? value
}

/**
 * Everything a status value should say when printed.
 *
 * `lookupStatus` returns the raw value for anything outside the vocabulary
 * rather than swallowing it, and that is preserved here: another app may have
 * written a status Ship has never heard of, and showing `todo` instead would be
 * inventing agreement that does not exist.
 */
const status = (vocab: typeof ISSUE_STATUSES, value: string) => lookupStatus(vocab, value).label

function projectSummary(project: Project, directory: Directory) {
  return {
    ref: project.addr,
    title: project.title,
    status: status(PROJECT_STATUSES, project.status),
    lead: who(directory, project.lead),
    archived: project.archived || undefined,
    folder: project.contentFolder,
    issues: undefined as number | undefined,
  }
}

function issueSummary(issue: Issue, directory: Directory) {
  return {
    ref: issue.ref ?? issue.addr,
    addr: issue.addr,
    title: issue.title,
    status: status(ISSUE_STATUSES, issue.status),
    assignee: who(directory, issue.assignee),
    author: who(directory, issue.author),
    project: issue.projectAddr,
  }
}

/** Everyone named anywhere in what we are about to print, resolved in one call. */
async function directoryFor(
  context: AgentContext,
  pubkeys: (string | undefined)[],
): Promise<Directory> {
  const wanted = [...new Set(pubkeys.filter((key): key is string => Boolean(key)))]
  return wanted.length ? store(context).profiles(wanted) : new Map()
}

/**
 * How much of the workspace this read could actually see.
 *
 * `loadAll` discovers from projects and widens into their Folders, so an issue
 * whose project record no longer resolves is unreachable — 13 of 27 on prod
 * when this was written (PEEK-154). The app has the same blind spot, so this is
 * not a defect being papered over; it is a limit being **stated**.
 *
 * Stating it matters more for an agent than for a person. Somebody browsing
 * sees projects and never forms the belief that they are looking at everything.
 * An agent asked "what is still open?" answers from whatever came back, and an
 * array carries no hint that a third of the data was never in scope. A number
 * is enough to stop a confident wrong summary; silence is not.
 *
 * Counted by asking the relay for issue events directly, with no `h` scoping —
 * the same unscoped query shape `resolveObject` already relies on. One extra
 * round trip per listing, which is cheap next to answering for half a workspace.
 */
async function coverage(
  context: AgentContext,
  reachable: Issue[],
): Promise<{ reachable: number; unreachable: number; total: number; note?: string }> {
  const events = await context.relay.query([{ kinds: [KIND.ISSUE], limit: 2000 }])

  const everything = new Set<string>()
  for (const event of events) {
    const d = event.tags.find((tag) => tag[0] === 'd')?.[1]
    if (d) everything.add(`${KIND.ISSUE}:${event.pubkey}:${d}`)
  }
  for (const issue of reachable) everything.add(issue.addr)

  const unreachable = everything.size - reachable.length
  return {
    reachable: reachable.length,
    unreachable,
    total: everything.size,
    note:
      unreachable > 0
        ? `${unreachable} issue(s) exist that discovery cannot reach, because the project they belong to no longer resolves. They are invisible to ship.estiva.app too. Do not describe this list as complete.`
        : undefined,
  }
}

/**
 * Find one object from whatever the caller typed.
 *
 * An agent is handed a reference by a person — "the auth issue", `LL-12`, a
 * pasted `naddr` — and demanding a canonical address would push that guesswork
 * onto whoever is least able to do it.
 *
 * **An ambiguous reference is an error, never a guess.** Silently picking the
 * first of two matching issues is how an agent confidently reports on the wrong
 * ticket, and that mistake is invisible afterwards.
 */
export function findIssue(issues: Issue[], reference: string): Issue {
  return resolveOne(issues, reference, {
    noun: 'issue',
    exact: (issue) => [issue.addr, issue.id, issue.ref],
    text: (issue) => issue.title,
    label: (issue) => `${issue.ref ?? issue.addr} — ${issue.title}`,
    hint: 'Pass a ref, an address or part of a title.',
  })
}

/**
 * The same rule, for projects.
 *
 * This did not exist. The `--project` filter used `.find()` and silently
 * returned the first of however many matched, which on prod meant
 * `--project "Feedback"` answering about Ship's project when three contain the
 * word (PEEK-162). Exact still wins, so `"Peek: Feedback"` — what a person
 * actually types — keeps working.
 */
export function findProject(projects: Project[], reference: string): Project {
  return resolveOne(projects, reference, {
    noun: 'project',
    exact: (project) => [project.addr, project.id, project.title],
    text: (project) => project.title,
    label: (project) => project.title,
    hint: 'Pass a project name or part of one.',
  })
}

/**
 * `open` is not a status the relay knows; it is what people mean.
 *
 * Asked "what issues are open", Desktop picked `todo` from the vocabulary and
 * left out everything In Progress — defensible from the enum, and not what was
 * asked. The vocabulary is the wire format's, and "open work" is the question,
 * so the mapping belongs here rather than in whoever is asking.
 */
const OPEN_STATUSES = ['todo', 'in_progress'] as const
const STATUS_ALIASES: Record<string, readonly string[]> = { open: OPEN_STATUSES }

export function statusesFor(requested: string): readonly string[] {
  const alias = STATUS_ALIASES[requested]
  if (alias) return alias
  if (ISSUE_STATUSES.some((entry) => entry.value === requested)) return [requested]

  // Refused rather than returned empty: "no issues" and "you asked for a status
  // that does not exist" look identical in an empty array, and only one of them
  // means the work is done.
  throw new BadRequest(
    `Unknown status "${requested}". Try: ${ISSUE_STATUSES.map((s) => s.value).join(', ')}, ` +
      `or "open" for ${OPEN_STATUSES.join(' and ')}.`,
  )
}

/**
 * Every write goes through here, and the shape is the safety property.
 *
 * `docs/untrusted-content.md` argues that a write must trace back to something
 * a person asked for and never to an instruction found in fetched content, and
 * that **tool shape is the strongest place to enforce it** — because it removes
 * the capability rather than governing its use.
 *
 * So: one object, one change, per call. There is no command here that takes a
 * filter, a status, or a search term and acts on whatever matches. "Close every
 * issue mentioning X" is not a thing this CLI can express, which means it is
 * not a thing an agent can be talked into, whatever the credential permits.
 *
 * That matters more than it looks on this deployment. Every channel is open
 * (PEEK-145), so Folder membership bounds nothing and `allowedKinds` is the
 * only other control — and the credential is now permitted every kind Ship
 * writes. Tool shape is the containment.
 *
 * Each write returns **what it actually did**, resolved and read back, so an
 * answer built on it names the object rather than paraphrasing the request.
 */
async function resolveIssueFor(context: AgentContext, reference: string) {
  const state = await store(context).loadAll()
  const issue = findIssue(state.issues, reference)
  return { state, issue }
}

/**
 * `Relay.publish` reports `ok: false` for a rejection that arrived as HTTP 200 —
 * the relay answers `200 {"accepted":false}` and the status code is not the
 * authority. Every write funnels through here so no caller can forget, since
 * the failure mode is an agent reporting an issue closed that the relay dropped.
 */
function published<T extends { ok: boolean; reason?: string; duplicate?: boolean }>(
  result: T,
  what: string,
): void {
  if (!result.ok) throw new BadRequest(`The relay refused ${what}: ${result.reason ?? 'no reason given'}`)
}

export const shipApp: AgentApp = {
  name: 'ship',
  summary: 'projects and issues in Estiva Ship',
  /*
    The cheapest read that proves relay access, for `connectionStatus`.

    One project, because a workspace always has at least the ability to be asked
    for one and the answer is tiny. An empty result is still a success: it
    proves the identity was admitted and the query was served, which is the
    thing being tested. "Admitted but empty" and "refused" are exactly the two
    states a connection check exists to tell apart, so this must not treat a
    count of zero as a failure.
  */
  probe: [{ kinds: [KIND.PROJECT], limit: 1 }],
  commands: [
    {
      name: 'projects',
      summary: 'every project, with status and lead',
      usage: 'projects [--archived]',
      async run(context, args) {
        const state = await store(context).loadAll()
        const directory = await directoryFor(context, state.projects.map((p) => p.lead))

        const wanted = args.flags.archived
          ? state.projects
          : state.projects.filter((project) => !project.archived)

        return wanted.map((project) => ({
          ...projectSummary(project, directory),
          // Counted here rather than in the summary so the shape stays the same
          // whether or not issues were loaded alongside.
          issues: state.issues.filter((issue) => issue.projectAddr === project.addr).length,
        }))
      },
    },
    {
      name: 'issues',
      summary: 'issues, newest first',
      usage: 'issues [--project <ref>] [--status <value>]',
      async run(context, args) {
        const state = await store(context).loadAll()
        const wantedProject = flagValue(args, 'project')
        const wantedStatus = flagValue(args, 'status')?.toLowerCase()

        const wantedStatuses = wantedStatus ? statusesFor(wantedStatus) : null

        let issues = state.issues
        if (wantedProject) {
          const project = findProject(state.projects, wantedProject)
          issues = issues.filter((issue) => issue.projectAddr === project.addr)
        }
        if (wantedStatuses) {
          issues = issues.filter((issue) =>
            wantedStatuses.includes(issue.status || DEFAULT_ISSUE_STATUS),
          )
        }

        const directory = await directoryFor(
          context,
          issues.flatMap((issue) => [issue.assignee, issue.author]),
        )

        return {
          issues: issues
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((issue) => issueSummary(issue, directory)),
          /*
            Reported against the whole workspace rather than the filtered slice,
            deliberately. An unreachable issue has no project and no status this
            read can see, so it cannot be attributed to a filter — and quietly
            dropping the count when `--project` is passed would hide the gap in
            exactly the narrow queries somebody trusts most.
          */
          coverage: await coverage(context, state.issues),
        }
      },
    },
    {
      name: 'show',
      summary: 'one issue, folded, with its conversation and history',
      usage: 'show <ref>',
      async run(context, args) {
        const reference = args.positional[0]
        if (!reference) throw new BadRequest('show needs a reference — try `ship issues` first.')

        const state = await store(context).loadAll()
        const issue = findIssue(state.issues, reference)

        const conversations = conversationsAbout(state.conversations, issue.addr)
        const history = state.activity.filter((change) => change.target === issue.addr)

        const directory = await directoryFor(context, [
          issue.author,
          issue.assignee,
          ...history.map((change) => change.author),
          // The values too, not just the actors — an assignee change names
          // somebody in `value`, and asking for the actors alone is what left
          // that half of the line unresolved.
          ...history.map((change) => change.value),
          ...conversations.flatMap((thread) => [
            thread.root.author,
            ...thread.replies.map((reply) => reply.author),
          ]),
        ])

        return {
          ...issueSummary(issue, directory),
          description: issue.description,
          createdAt: new Date(issue.createdAt * 1000).toISOString(),
          folder: issue.folder,
          /*
            The change stream, not a derived summary. Who moved an issue and
            when is the part a person asks about, and it is also the evidence
            that somebody other than the author acted — which is the whole
            reason the model is event-sourced rather than a mutable row.
          */
          history: history.map((change) => ({
            field: change.field,
            /*
              A change's *value* can be a pubkey too — `assignee` is one — and
              resolving only the actor produced the half-fixed line
              "Claude set assignee to b38fd268…", where the reader can see who
              acted and not who it landed on.

              Resolved by shape rather than by field name: any 64-character hex
              value is a key somebody may have a name for, and matching on
              `field === 'assignee'` would silently miss the next field that
              carries one.
            */
            value: resolvePubkeys(directory, change.value),
            // `ts` when the change carried one, `created_at` otherwise — the
            // same precedence the fold uses, because second-resolution
            // timestamps tie for changes made in one burst.
            by: who(directory, change.author),
            at: new Date(change.ts ?? change.createdAt * 1000).toISOString(),
          })),
          conversation: conversations.map((thread) => ({
            id: thread.id,
            messages: [thread.root, ...thread.replies].map((message) => ({
              by: who(directory, message.author),
              at: new Date((message.ts ?? message.createdAt * 1000)).toISOString(),
              body: message.body,
            })),
          })),
        }
      },
    },
    {
      name: 'comment',
      summary: 'add a comment to one issue',
      usage: 'comment <ref> --body "..."',
      async run(context, args) {
        const reference = args.positional[0]
        if (!reference) throw new BadRequest('comment needs an issue reference.')
        const body = flagValue(args, 'body')
        if (!body) throw new BadRequest('comment needs --body.')

        const { issue } = await resolveIssueFor(context, reference)
        /*
          Posted into the issue's own Folder and tagged `about` its address, so
          it lands where Peek shows the conversation rather than as a loose
          message. `aboutRef` appends the naddr, which is what makes Peek render
          the issue widget above it.
        */
        const result = await store(context).postMessage({
          folder: issue.folder,
          body,
          about: issue.addr,
        })
        published(result, `a comment on ${issue.ref ?? issue.addr}`)

        return { commented: { ref: issue.ref, addr: issue.addr, title: issue.title }, eventId: result.eventId }
      },
    },
    {
      name: 'set-status',
      summary: 'set one issue\'s status',
      usage: 'set-status <ref> <status>',
      async run(context, args) {
        const [reference, status] = args.positional
        if (!reference || !status) throw new BadRequest('set-status needs a reference and a status.')

        // Validated against the vocabulary before publishing: a value outside it
        // is displayed rather than swallowed, so a typo becomes a visible bogus
        // status on a real issue instead of an error.
        const wanted = status.toLowerCase()
        if (!ISSUE_STATUSES.some((entry) => entry.value === wanted)) {
          throw new BadRequest(
            `Unknown status "${status}". Try: ${ISSUE_STATUSES.map((s) => s.value).join(', ')}`,
          )
        }

        const { issue } = await resolveIssueFor(context, reference)
        const result = await store(context).setField({
          folder: issue.folder,
          target: issue.addr,
          field: 'status',
          value: wanted,
        })
        published(result, `a status change on ${issue.ref ?? issue.addr}`)

        return {
          changed: { ref: issue.ref, addr: issue.addr, title: issue.title },
          field: 'status',
          from: issue.status,
          to: wanted,
          eventId: result.eventId,
        }
      },
    },
    {
      name: 'assign',
      summary: 'assign one issue to somebody',
      usage: 'assign <ref> <pubkey|me>',
      async run(context, args) {
        const [reference, who] = args.positional
        if (!reference || !who) throw new BadRequest('assign needs a reference and a pubkey, or "me".')

        // `me` is the signing identity — the agent itself. Anyone else has to be
        // named by pubkey rather than by display name, because display names are
        // self-set (docs/untrusted-content.md) and assigning by one would let a
        // person choose who work lands on by renaming themselves.
        const assignee = who === 'me' ? context.signer.pubkey : who
        if (!/^[0-9a-f]{64}$/i.test(assignee)) {
          throw new BadRequest('assign takes a 64-character hex pubkey, or "me". Names are not unique.')
        }

        const { issue } = await resolveIssueFor(context, reference)
        const result = await store(context).setField({
          folder: issue.folder,
          target: issue.addr,
          field: 'assignee',
          value: assignee.toLowerCase(),
        })
        published(result, `an assignment on ${issue.ref ?? issue.addr}`)

        return {
          changed: { ref: issue.ref, addr: issue.addr, title: issue.title },
          field: 'assignee',
          from: issue.assignee,
          to: assignee.toLowerCase(),
          eventId: result.eventId,
        }
      },
    },
    {
      name: 'create-issue',
      summary: 'file one new issue in a project',
      usage: 'create-issue --project <ref> --title "..." [--description "..."]',
      async run(context, args) {
        const projectRef = flagValue(args, 'project')
        const title = flagValue(args, 'title')
        if (!projectRef) throw new BadRequest('create-issue needs --project.')
        if (!title) throw new BadRequest('create-issue needs --title.')

        const state = await store(context).loadAll()
        const project = findProject(state.projects, projectRef)

        // The display key is derived from what is currently visible, so it can
        // collide — the address is the identity and this is decoration. Derived
        // here rather than left blank so the issue looks like its siblings.
        const siblings = state.issues.filter((issue) => issue.projectAddr === project.addr)
        const ref = nextRef(refPrefix(project.title), siblings.map((issue) => issue.ref))

        const created = await store(context).createIssue({
          folder: project.contentFolder,
          title,
          description: flagValue(args, 'description'),
          projectAddr: project.addr,
          ref,
        })
        published(created.result, `a new issue in ${project.title}`)

        return {
          created: { ref, addr: created.addr, title, project: project.title },
          eventId: created.result.eventId,
        }
      },
    },
  ],
}
