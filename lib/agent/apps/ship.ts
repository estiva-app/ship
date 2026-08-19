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
import { Store } from '../../../src/store'
import type { Issue, Project } from '../../../src/fold'
import { conversationsAbout } from '../../../src/fold'
import { DEFAULT_ISSUE_STATUS, ISSUE_STATUSES, PROJECT_STATUSES, lookupStatus } from '../../../src/kinds'
import type { Directory } from '../../../src/profiles'
import { BadRequest, flagValue, type AgentApp, type AgentContext } from '../cli'

const store = (context: AgentContext) => new Store(context.relay, context.signer)

/** A pubkey as something a person can read, falling back to a short hex. */
function who(directory: Directory, pubkey: string | undefined): string | undefined {
  if (!pubkey) return undefined
  const profile = directory.get(pubkey)
  return profile?.name ?? `${pubkey.slice(0, 8)}…`
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
  const needle = reference.trim().toLowerCase()
  if (!needle) throw new BadRequest('Which issue? Pass a ref, an address or part of a title.')

  const exact = issues.filter(
    (issue) =>
      issue.addr.toLowerCase() === needle ||
      issue.id.toLowerCase() === needle ||
      issue.ref?.toLowerCase() === needle,
  )
  if (exact.length === 1) return exact[0]

  const byTitle = issues.filter((issue) => issue.title.toLowerCase().includes(needle))
  if (byTitle.length === 1) return byTitle[0]

  if (byTitle.length > 1) {
    const candidates = byTitle.slice(0, 8).map((issue) => `${issue.ref ?? issue.addr} — ${issue.title}`)
    throw new BadRequest(
      `"${reference}" matches ${byTitle.length} issues:\n  ${candidates.join('\n  ')}`,
    )
  }
  throw new BadRequest(`Nothing matches "${reference}".`)
}

export const shipApp: AgentApp = {
  name: 'ship',
  summary: 'projects and issues in Estiva Ship',
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

        if (wantedStatus && !ISSUE_STATUSES.some((entry) => entry.value === wantedStatus)) {
          // Refused rather than returned empty: "no issues" and "you asked for a
          // status that does not exist" look identical in an empty array, and
          // only one of them means the work is done.
          throw new BadRequest(
            `Unknown status "${wantedStatus}". Try: ${ISSUE_STATUSES.map((s) => s.value).join(', ')}`,
          )
        }

        let issues = state.issues
        if (wantedProject) {
          const needle = wantedProject.toLowerCase()
          const project = state.projects.find(
            (candidate) =>
              candidate.addr.toLowerCase() === needle ||
              candidate.id.toLowerCase() === needle ||
              candidate.title.toLowerCase().includes(needle),
          )
          if (!project) throw new BadRequest(`No project matches "${wantedProject}".`)
          issues = issues.filter((issue) => issue.projectAddr === project.addr)
        }
        if (wantedStatus) {
          issues = issues.filter((issue) => (issue.status || DEFAULT_ISSUE_STATUS) === wantedStatus)
        }

        const directory = await directoryFor(
          context,
          issues.flatMap((issue) => [issue.assignee, issue.author]),
        )
        return issues
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((issue) => issueSummary(issue, directory))
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
            value: change.value,
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
  ],
}
