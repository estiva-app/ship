/**
 * What a cold load concludes about who you are (REW-2).
 *
 * The decision itself is `decideBoot` in `@estiva-app/identity` — shared with
 * Peek, because the expensive mistakes live in the decision rather than in the
 * rendering. This file is the I/O around it: read the address bar and storage,
 * ask, act.
 *
 * ## Why this runs before the app is imported
 *
 * `api/store.ts` builds its signer at module scope, which is right — the answer
 * is knowable at load time and threading it through React would make every
 * consumer aware of auth. But it means the session must already be settled when
 * that module first evaluates, so `main.tsx` awaits this and imports `App`
 * afterwards, dynamically. Import order is load-bearing here, which is unusual
 * enough to say out loud.
 *
 * ## `enteredThisPageLoad` is always false here
 *
 * That flag exists to stop the app navigating away mid-session and taking
 * whatever was on screen with it. This runs exactly once, before anything is on
 * screen, so a cold boot is the only case it sees. A mid-session expiry is
 * handled by renewal inside the signer, not by coming back through here.
 */
import {
  decideAfterRenewal,
  decideBoot,
  type BootAction,
  type BootObservation,
  type Renewal,
  type ShellReason,
  type ShellState,
} from '@estiva-app/identity'
import {
  beginSignIn,
  callbackParams,
  canRenew,
  clearQuery,
  completeSignIn,
  currentToken,
  renewInPlace,
  guardAttemptedAt,
  restoreRoute,
  startRenewal,
  signInAvailable,
  stashShellReason,
  takeReturnTo,
  takeShellReason,
} from './estivaId'

export type BootResult =
  /** Render the app. Signed in, or anonymous in a build with no sign-in. */
  | { kind: 'app' }
  /** Render the shell and wait for a tap. */
  | { kind: 'shell'; state: ShellState }
  /** Navigating away. Render nothing; the page is leaving. */
  | { kind: 'leaving' }

/**
 * Settle who this load belongs to.
 *
 * Never throws: a failure here would leave a blank page, which is the one
 * outcome worse than an honest shell.
 */
export async function bootAuth(): Promise<BootResult> {
  // A build with no sign-in runs anonymous-only, and that is a supported mode
  // rather than a degraded one. Nothing to decide.
  if (!signInAvailable) return { kind: 'app' }

  const callback = callbackParams()
  const observation: BootObservation = {
    callback,
    hasValidToken: currentToken() !== null,
    canRenew: canRenew(),
    guardAttemptedAt: guardAttemptedAt(),
    enteredThisPageLoad: false,
    now: Date.now(),
  }
  return act(decideBoot(observation), observation)
}

/**
 * How long the boot waits on a renewal before entering on what it holds.
 *
 * A renewal the network neither answers nor fails (wifi joined, no route yet)
 * would hold a blank page for as long as the browser waits. Past this, Ship
 * enters as for an unreachable Estiva ID and the schedule renews once the
 * network answers: the package hands it the same renewal, still out. Peek's
 * `RENEWAL_WAIT_MS`.
 */
export const RENEWAL_WAIT_MS = 3_000

async function act(action: BootAction, observation: BootObservation): Promise<BootResult> {
  const callback = observation.callback
  switch (action.do) {
    case 'renew': {
      // An expired access token and a refresh token to spend: renew here, with
      // no trip to Estiva ID, and stay on the page asked for (AUT-4, as Peek's
      // AUT-3). A refusal is an ended sign-in and asks for the passkey on this
      // page; no answer enters on the held token.
      let timer: ReturnType<typeof setTimeout> | undefined
      const late = new Promise<Renewal>((resolve) => {
        timer = setTimeout(() => resolve({ outcome: 'unreachable' }), RENEWAL_WAIT_MS)
      })
      const outcome = await Promise.race([renewInPlace(), late]).then((r) => r.outcome)
      clearTimeout(timer)
      return act(decideAfterRenewal(outcome, observation), observation)
    }

    case 'enter':
      startRenewal()
      return { kind: 'app' }

    case 'complete_callback':
      try {
        const { returnTo } = await completeSignIn()
        clearQuery()
        restoreRoute(returnTo)
        // Started only on the two paths that hold a session, and after the
        // token is stored — the schedule reads the expiry it is arming against.
        startRenewal()
        return { kind: 'app' }
      } catch (cause) {
        // Every refusal from `/token` is a uniform `invalid_grant` by design, so
        // the useful detail is on this side. The query is cleared either way —
        // a spent code left in the address bar invites a reload that fails again
        // for a different reason.
        clearQuery()
        stashShellReason('exchange_failed')
        return shell('exchange_failed', cause)
      }

    case 'probe_silently':
      try {
        await beginSignIn({ silent: true })
        // `beginSignIn` navigates, so nothing after it runs. Reaching here means
        // the navigation did not happen.
        return { kind: 'leaving' }
      } catch {
        return shell('network')
      }

    case 'prompt_passkey':
      // A refused silent probe lands on `/?error=…`, but it was started from the link the person opened. Put that link
      // back before the shell draws, so "Try again" starts from it and signing in lands there, a block's
      // `#block-…` included (as Peek does since PEEK-123; c13b0096).
      if (callback?.error) {
        const back = takeReturnTo()
        clearQuery()
        if (back) restoreRoute(back)
      }
      // A reason stashed by a previous load is more specific than the one the
      // decision inferred — it was observed rather than deduced.
      // `authenticating`, as Peek's: the button says "Continue with passkey", not "Try again".
      return { kind: 'shell', state: { phase: 'authenticating', reason: takeShellReason() ?? action.reason } }

    case 'fail':
      return shell(action.reason)
  }
}

function shell(reason: ShellReason, cause?: unknown): BootResult {
  if (cause) console.warn('[auth] entry failed:', cause)
  return { kind: 'shell', state: { phase: 'failed', reason } }
}

/**
 * The tap on the shell's one button.
 *
 * Loud rather than silent: the person has just asked, so being sent to a passkey
 * prompt is the expected outcome instead of an interruption.
 */
export async function enterFromShell(): Promise<void> {
  await beginSignIn()
}
