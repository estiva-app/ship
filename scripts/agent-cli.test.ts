/**
 * The agent CLI's decisions, tested without a relay.
 *
 * Everything here is a pure function over already-fetched data, which is the
 * point: argument parsing and reference resolution are where an agent quietly
 * does the wrong thing, and neither needs a network to be wrong. The parts that
 * do need one are covered by `probe-agent.ts` and `agent-signer.test.ts`, which
 * talk to the real services on purpose.
 *
 *   npx tsx scripts/agent-cli.test.ts
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BadRequest, flagValue, parseArgs } from '../lib/agent/cli'
import { loadCredentials } from '../lib/agent/credentials'
import { findIssue, findProject, resolvePubkeys, statusesFor } from '../lib/agent/apps/ship'
import type { Project } from '../src/fold'
import { findTopic, type Topic } from '../lib/agent/apps/peek'
import type { Issue } from '../src/fold'
import type { Directory } from '../src/profiles'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

function refuses(label: string, action: () => unknown, contains?: string) {
  try {
    action()
    check(label, false, 'it succeeded, which it must not')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    check(label, error instanceof BadRequest && (!contains || message.includes(contains)), message.split('\n')[0])
  }
}

const issue = (over: Partial<Issue>): Issue => ({
  addr: '30851:abc:1',
  id: '1',
  author: 'abc',
  createdAt: 0,
  title: 'Untitled',
  description: '',
  folder: 'f',
  status: 'todo',
  fields: {},
  ...over,
})

console.log('— parsing —')

{
  const args = parseArgs(['ship', 'issues', '--project', 'Peek', '--archived'])
  check('keeps positionals in order', args.positional.join(',') === 'ship,issues')
  check('reads a value flag', args.flags.project === 'Peek')
  check('reads a bare flag as true', args.flags.archived === true)
}

{
  // The one that silently corrupts input: a boolean flag immediately followed
  // by another flag must not swallow it as its value.
  const args = parseArgs(['ship', 'issues', '--archived', '--project', 'Peek'])
  check('a flag before a flag stays boolean', args.flags.archived === true)
  check('and the next flag keeps its value', args.flags.project === 'Peek')
}

refuses('a value flag with nothing after it is refused', () =>
  flagValue(parseArgs(['ship', 'issues', '--status']), 'status'),
)

check('an absent flag is undefined, not an error', flagValue(parseArgs(['ship']), 'status') === undefined)

console.log('\n— resolving a reference —')

const issues = [
  issue({ id: 'a', addr: '30851:abc:a', ref: 'PEE-1', title: 'Assignee picker is missing' }),
  issue({ id: 'b', addr: '30851:abc:b', ref: 'PEE-2', title: 'Editing / renaming topics' }),
  issue({ id: 'c', addr: '30851:abc:c', ref: 'PEE-3', title: 'Files panel when opening topics' }),
]

check('finds by display ref', findIssue(issues, 'PEE-2').id === 'b')
check('is case-insensitive', findIssue(issues, 'pee-2').id === 'b')
check('finds by address', findIssue(issues, '30851:abc:c').id === 'c')
check('finds by a unique title fragment', findIssue(issues, 'assignee picker').id === 'a')

/*
  The important one. Two issues mention "topics", and picking either would be an
  agent confidently reporting on the wrong ticket — a mistake that leaves no
  trace once it has been made. Refusing costs one more question; guessing costs
  somebody's afternoon and their trust in the tool.
*/
refuses('refuses an ambiguous fragment rather than guessing', () => findIssue(issues, 'topics'), 'matches 2 issues')
refuses('names the candidates when it refuses', () => findIssue(issues, 'topics'), 'PEE-2')
refuses('refuses nothing at all', () => findIssue(issues, 'nothing-like-this'), 'No issue matches')
refuses('refuses an empty reference', () => findIssue(issues, '   '))

/*
  An exact ref must win even when it is also a substring of another title —
  otherwise adding an issue called "About PEE-1" would break every lookup of
  PEE-1, which is a booby trap nobody would think to test after the fact.
*/
const withDecoy = [...issues, issue({ id: 'd', addr: '30851:abc:d', ref: 'PEE-9', title: 'Follow-up to PEE-1' })]
check('an exact ref beats a title containing it', findIssue(withDecoy, 'PEE-1').id === 'a')

console.log('\n— resolving a project (the one that used to guess) —')

/*
  The real collision, reproduced. Three projects on prod contain "Feedback", and
  `--project "Feedback"` silently answered about Ship's for over a week because
  the filter used `.find()` while the issue and topic lookups beside it refused.
  A rule kept in two places out of three is worse than no rule, since a reader
  assumes it holds everywhere.
*/
const project = (over: Partial<Project>): Project => ({
  addr: '30850:abc:x',
  id: 'x',
  author: 'abc',
  createdAt: 0,
  title: 'Untitled',
  description: '',
  contentFolder: 'f',
  originFolder: 'f',
  status: 'planned',
  archived: false,
  fields: {},
  ...over,
})

const projects = [
  project({ id: 'ship', addr: '30850:abc:ship', title: 'Ship: Feedback & Bugs' }),
  project({ id: 'id', addr: '30850:abc:id', title: 'Estiva ID: Feedback & Bugs' }),
  project({ id: 'peek', addr: '30850:abc:peek', title: 'Peek: Feedback & Bugs' }),
  project({ id: 'other', addr: '30850:abc:other', title: 'Other' }),
]

refuses('refuses a word three projects share', () => findProject(projects, 'Feedback'), 'matches 3 projects')
refuses('and names every one of them', () => findProject(projects, 'Feedback'), 'Peek: Feedback & Bugs')

/*
  The fix must not become "be stricter". "Peek: Feedback" is what a person types
  and it has to keep working, so a *unique* partial still resolves.
*/
check('a unique partial still resolves', findProject(projects, 'Peek: Feedback').id === 'peek')
check('an exact title resolves', findProject(projects, 'Other').id === 'other')
check('an address resolves', findProject(projects, '30850:abc:id').id === 'id')
refuses('refuses a project that is not there', () => findProject(projects, 'Nope'), 'No project matches')

console.log('\n— resolving a topic (second app, same rules) —')

/*
  The guard has to hold per app, not per codebase. Peek's topics are named by
  people rather than generated, so near-duplicates are the norm rather than the
  exception — the live workspace has "test", "test 2", "test 3", "test 4" and
  "test 5" side by side, which is exactly where a substring match would guess.
*/
const topic = (over: Partial<Topic>): Topic => ({
  folder: 'f',
  name: 'Untitled',
  createdBy: 'abc',
  createdAt: 0,
  ...over,
})

const topics = [
  topic({ folder: 'aaa', name: 'test' }),
  topic({ folder: 'bbb', name: 'test 2' }),
  topic({ folder: 'ccc', name: 'test 3' }),
  topic({ folder: 'ddd', name: 'Planning and sequencing' }),
]

check('finds a topic by exact name', findTopic(topics, 'Planning and sequencing').folder === 'ddd')
check('finds a topic by folder id', findTopic(topics, 'ccc').folder === 'ccc')

/*
  "test" is both an exact name and a prefix of two others. Exact must win, or
  every topic whose name is a prefix of another becomes unreachable.
*/
check('an exact name beats names containing it', findTopic(topics, 'test').folder === 'aaa')
check('a unique fragment still resolves', findTopic(topics, 'sequencing').folder === 'ddd')
refuses('refuses an ambiguous topic fragment', () => findTopic(topics, 'tes'), 'matches 3 topics')
refuses('refuses an unknown topic', () => findTopic(topics, 'nope'), 'No topic matches')

console.log('\n— what "open" means —')

/*
  Asked "what issues are open", Desktop chose `todo` from the vocabulary and
  left out everything In Progress. Defensible from the enum offered, and not
  what was asked — so the alias exists to stop the most natural question having
  the narrowest answer.
*/
check('open covers todo and in_progress', statusesFor('open').join(',') === 'todo,in_progress')
check('a real status stays itself', statusesFor('done').join(',') === 'done')
refuses('an unknown status is refused', () => statusesFor('wibble'), 'Unknown status')
refuses('and the refusal mentions open', () => statusesFor('wibble'), 'open')

console.log('\n— naming a change\'s value —')

/*
  A change's value can be a public key: `assignee` is one. Resolving only the
  actor produced "Claude set assignee to b38fd268…" on a real issue — half a
  sentence, where you can see who acted but not who it landed on.

  Ship's own UI already did this (`apps/ship/views/issue.ts`); the agent module
  did not, which is the drift PEEK-155 warns about in miniature.
*/
const people: Directory = new Map([
  ['a'.repeat(64), { pubkey: 'a'.repeat(64), name: 'Claude', createdAt: 0 }],
])

check('names a pubkey it knows', resolvePubkeys(people, 'a'.repeat(64)) === 'Claude')
check('is case-insensitive about the key', resolvePubkeys(people, 'A'.repeat(64)) === 'Claude')

/*
  Left as-is rather than prettified. An unnamed participant is unnamed, and an
  invented label would be worse than the hex — it would imply somebody had a
  profile when nobody does.
*/
check('leaves a pubkey nobody knows alone', resolvePubkeys(people, 'b'.repeat(64)) === 'b'.repeat(64))

// Matched on shape, so a status value is never mistaken for a key.
check('leaves an ordinary value alone', resolvePubkeys(people, 'in_progress') === 'in_progress')
check('leaves an empty value alone', resolvePubkeys(people, '') === '')

console.log('\n— credentials —')

/*
  Claude Desktop launches the server with `wsl.exe -e`, which runs a program
  directly: no login shell, no profile, nothing exported. A server that could
  only read process.env would work in every terminal and fail in the one place
  it is actually used, which is how this was found — Desktop reported missing
  credentials while the CLI worked perfectly.
*/
const dir = mkdtempSync(join(tmpdir(), 'estiva-creds-'))
const file = join(dir, 'agent.env')
writeFileSync(
  file,
  ['# a comment', '', 'ESTIVA_ID_CLIENT_ID=from-file', 'ESTIVA_ID_CLIENT_SECRET="quoted-secret"'].join('\n'),
)

{
  const loaded = loadCredentials({ ESTIVA_AGENT_ENV_FILE: file } as NodeJS.ProcessEnv)
  check('reads credentials from a file when the environment is empty', loaded.clientId === 'from-file')
  check('strips surrounding quotes', loaded.clientSecret === 'quoted-secret')
  check('defaults the identity service', loaded.base.startsWith('https://'))
}

{
  // A terminal must be able to override the file without editing it.
  const loaded = loadCredentials({
    ESTIVA_AGENT_ENV_FILE: file,
    ESTIVA_ID_CLIENT_ID: 'from-env',
    ESTIVA_ID_CLIENT_SECRET: 'env-secret',
  } as NodeJS.ProcessEnv)
  check('the environment wins over the file', loaded.clientId === 'from-env')
}

/*
  The refusal is a security property, not a nicety.

  An earlier version told the caller to run `set -a; . ~/.estiva-agent.env;
  set +a`. Claude Desktop read that, recognised shell commands arriving through
  tool output as indistinguishable from a prompt injection, and refused to act
  — correctly. Anything a tool says reaches a model as untrusted text, so it
  must describe state and never issue a command.
*/
try {
  loadCredentials({ ESTIVA_AGENT_ENV_FILE: join(dir, 'nothing-here.env') } as NodeJS.ProcessEnv)
  check('refuses when no credentials exist anywhere', false, 'it succeeded')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  check('refuses when no credentials exist anywhere', true)
  check('names the file it looked for', message.includes('nothing-here.env'))
  check('says the fix is not available from a conversation', message.includes('cannot be'))

  const commandLike = /set -a|source |npm |npx |chmod |export [A-Z_]+=/.test(message)
  check('contains no command for a model to run', !commandLike, message.slice(0, 70))
}

console.log(failures === 0 ? '\nAll agent CLI checks passed.' : `\n${failures} failed.`)
process.exit(failures === 0 ? 0 : 1)
