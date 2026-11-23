/**
 * Why Ship's requests last failed, for a failure a screen draws a moment later holding only "it failed" (34396209):
 * the transport and the signer say what they heard, and the error reporter puts the latest reason on a failure
 * report, so Sentry files "the relay said wait" apart from "the sign-in had ended". 23 Nov: nine "Could not load"
 * reports after the per-minute fixes sat in one error, and none was the limit.
 *
 * Kept apart from `errorReports`, which reads the window as it loads: `api/store.ts` and a test use this freely.
 *
 * why: https://github.com/estiva-app/estiva-docs/blob/main/decisions/error-reports-go-to-hosted-sentry-built-from-an-allowed-list.md
 */
import { createHeardFailures, failureReasonOf } from '@estiva-app/platform'
import type { Signer } from '@estiva-app/protocol'

export const heardFailures = createHeardFailures()

/** A relay answer that is not a success, or a request that threw before one came. Never throws. */
export function heardFromRelay(error: unknown, status?: number): void {
  try {
    heardFailures.heard(failureReasonOf(error, status))
  } catch {
    /* what the request said stands */
  }
}

/** `signer`, saying why a signature failed (Estiva ID's 401 or its own limit) before the failure goes on as it was. */
export function hearingSigner(signer: Signer): Signer {
  return {
    pubkey: signer.pubkey,
    kind: signer.kind,
    async sign(unsigned) {
      try {
        return await signer.sign(unsigned)
      } catch (error) {
        try {
          heardFailures.heard(failureReasonOf(error, undefined, 'id'))
        } catch {
          /* the signer's own error stands */
        }
        throw error
      }
    },
  }
}
