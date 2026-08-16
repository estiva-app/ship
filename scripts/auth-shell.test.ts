/**
 * The auth shell contract (PEEK-115/116).
 *
 * `lib/auth/shell/contract.ts` is duplicated verbatim in Peek, because the two
 * repos are independent and there is no package registry between them. That is
 * the same arrangement as the Nostr event code, and it needs the same defence:
 * a test that fails when the copies drift. Peek runs equivalent assertions
 * against its copy under Vitest.
 *
 * The interesting cases are the awkward ones. A shell that enters when it can
 * is easy; a shell that refuses to bounce forever is the actual feature.
 *
 *   npx tsx scripts/auth-shell.test.ts
 */
import {
  CONTINUE_LABEL,
  GUARD_TTL_MS,
  PROBE_TIMEOUT_MS,
  SHELL_COPY,
  type ShellReason,
  decideBoot,
  isRecoverable,
  reasonForCallbackError,
} from '../lib/auth/shell/contract'

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const NOW = 1_700_000_000_000
const decide = (o: Partial<Parameters<typeof decideBoot>[0]> = {}) =>
  decideBoot({
    callback: null,
    hasValidToken: false,
    guardAttemptedAt: null,
    enteredThisPageLoad: false,
    now: NOW,
    ...o,
  })

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

check('enters on a live token', eq(decide({ hasValidToken: true }), { do: 'enter' }))
check('probes silently on a cold load', eq(decide(), { do: 'probe_silently' }))
check('redeems a returned code', eq(decide({ callback: { code: 'abc' } }), { do: 'complete_callback' }))

check(
  'login_required becomes the passkey affordance, in place',
  eq(decide({ callback: { error: 'login_required' } }), { do: 'prompt_passkey', reason: 'no_session' }),
)
check(
  'a suspended identity is not offered a passkey',
  eq(decide({ callback: { error: 'access_denied' } }), { do: 'prompt_passkey', reason: 'identity_inactive' }) &&
    !isRecoverable('identity_inactive'),
)

// The loop guard. Without it, an app that redirects on every empty boot against
// a service that redirects straight back is an infinite bounce.
check(
  'never probes twice in one page-load chain',
  eq(decide({ guardAttemptedAt: NOW - 500 }), { do: 'prompt_passkey', reason: 'loop_guard' }),
)
check(
  'a slow round trip reads as a timeout, not a loop',
  eq(decide({ guardAttemptedAt: NOW - PROBE_TIMEOUT_MS - 1 }), { do: 'prompt_passkey', reason: 'timeout' }),
)
check(
  'a stale guard lets a returning tab try again',
  eq(decide({ guardAttemptedAt: NOW - GUARD_TTL_MS - 1 }), { do: 'probe_silently' }),
)
// Both arrive together on every successful silent entry: the guard was set on
// the way out. The code has to win or the probe is discarded at the last step.
check(
  'a returned code beats a guard set on the way out',
  eq(decide({ callback: { code: 'abc' }, guardAttemptedAt: NOW - 500 }), { do: 'complete_callback' }),
)

const reasons: ShellReason[] = [
  'no_session',
  'session_expired',
  'identity_inactive',
  'token_rejected',
  'exchange_failed',
  'network',
  'timeout',
  'loop_guard',
]
check(
  'copy covers every reason and nothing else',
  reasons.every((r) => Boolean(SHELL_COPY[r])) &&
    eq(Object.keys(SHELL_COPY).sort(), [...reasons].sort()),
)
// A live token the backend refuses is a configuration fault. Telling somebody
// their session expired sends them to re-authenticate against a wall.
check(
  'token_rejected never claims the session expired',
  /configuration/i.test(SHELL_COPY.token_rejected) &&
    !/your session (has )?(expired|ended)/i.test(SHELL_COPY.token_rejected) &&
    /will not fix/i.test(SHELL_COPY.token_rejected),
)
check(
  'the affordance offers a passkey rather than naming the provider',
  !/sign in/i.test(CONTINUE_LABEL) && /passkey/i.test(CONTINUE_LABEL),
)
check('unrecognised errors stay retryable', reasonForCallbackError('server_error') === 'exchange_failed')

// A cold boot and a token dying under somebody's hands look identical — no
// valid token — and treating them the same navigated the page away mid-work.
check(
  'mid-session expiry asks before navigating',
  eq(decide({ enteredThisPageLoad: true }), { do: 'prompt_passkey', reason: 'session_expired' }),
)
check('a cold boot still enters silently', eq(decide(), { do: 'probe_silently' }))
check(
  'a code still wins over mid-session expiry',
  eq(decide({ enteredThisPageLoad: true, callback: { code: 'abc' } }), { do: 'complete_callback' }),
)

console.log(failures === 0 ? '\nAll auth-shell checks passed.' : `\n${failures} failed.`)
process.exit(failures === 0 ? 0 : 1)
