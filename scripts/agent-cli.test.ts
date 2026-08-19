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
import { BadRequest, flagValue, parseArgs } from '../lib/agent/cli'
import { findIssue } from '../lib/agent/apps/ship'
import type { Issue } from '../src/fold'

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
refuses('refuses nothing at all', () => findIssue(issues, 'nothing-like-this'), 'Nothing matches')
refuses('refuses an empty reference', () => findIssue(issues, '   '))

/*
  An exact ref must win even when it is also a substring of another title —
  otherwise adding an issue called "About PEE-1" would break every lookup of
  PEE-1, which is a booby trap nobody would think to test after the fact.
*/
const withDecoy = [...issues, issue({ id: 'd', addr: '30851:abc:d', ref: 'PEE-9', title: 'Follow-up to PEE-1' })]
check('an exact ref beats a title containing it', findIssue(withDecoy, 'PEE-1').id === 'a')

console.log(failures === 0 ? '\nAll agent CLI checks passed.' : `\n${failures} failed.`)
process.exit(failures === 0 ? 0 : 1)
