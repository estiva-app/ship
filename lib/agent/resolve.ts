/**
 * Turning what a person typed into exactly one thing, or refusing.
 *
 * People hand an agent a reference the way they say it out loud — `PEE-1`, "the
 * assignee one", "Peek: Feedback". Demanding a canonical address pushes the
 * guesswork onto whoever is least equipped to do it, so matching has to be
 * generous. Generous matching is also how an agent ends up confidently reporting
 * on the wrong ticket.
 *
 * **So: match generously, and refuse when generosity produced more than one.**
 *
 * The refusal is the load-bearing half. Silently taking the first of several
 * matches produces an answer that is indistinguishable from a correct one — the
 * person sees a plausible issue, believes it is the one they meant, and nothing
 * afterwards reveals otherwise. Refusing costs one more question. Guessing costs
 * somebody's afternoon and their trust in every answer that came before.
 *
 * ## Why this is a shared function rather than a rule people follow
 *
 * It was a rule people follow, and it lasted two implementations. `findIssue`
 * and `findTopic` both refused ambiguity carefully; the project filter beside
 * them was written with `.find()` and quietly returned the first match for over
 * a week (PEEK-162). Measured on prod, `--project "Feedback"` matched three
 * projects and answered about the wrong one without a word.
 *
 * A rule enforced in two places out of three is worse than no rule, because a
 * reader assumes it holds everywhere. This module exists so the fourth caller
 * cannot forget.
 *
 * Deliberately generic: it names no kind, no tag and no object type, so it
 * belongs on the app-agnostic side of the seam.
 */
import { BadRequest } from './cli'

export interface Resolvable<T> {
  /** Singular noun for messages: `issue`, `topic`, `project`. */
  noun: string
  /**
   * Identifiers that must match the whole reference, case-insensitively.
   *
   * Checked before any substring match, and a single exact hit wins outright.
   * Without that precedence, an issue titled "Follow-up to PEE-1" would make
   * `PEE-1` ambiguous and render the original unreachable — a booby trap that
   * appears the day somebody files an ordinary follow-up.
   */
  exact: (item: T) => (string | undefined)[]
  /** Free text searched by substring when no exact identifier matched. */
  text: (item: T) => string
  /** How a candidate is listed back when the reference was ambiguous. */
  label: (item: T) => string
  /** Appended to the "what did you mean" message, e.g. what forms are accepted. */
  hint?: string
}

/** How many candidates to name before it stops being a helpful list. */
const MAX_CANDIDATES = 8

export function resolveOne<T>(items: T[], reference: string, how: Resolvable<T>): T {
  const needle = reference.trim().toLowerCase()
  if (!needle) {
    throw new BadRequest(`Which ${how.noun}?${how.hint ? ` ${how.hint}` : ''}`)
  }

  const exact = items.filter((item) =>
    how.exact(item).some((value) => value?.toLowerCase() === needle),
  )
  if (exact.length === 1) return exact[0]

  const partial = items.filter((item) => how.text(item).toLowerCase().includes(needle))
  if (partial.length === 1) return partial[0]

  if (partial.length > 1 || exact.length > 1) {
    /*
      Two exact matches is a genuine collision in the data rather than a vague
      question — display refs are not unique, and the workspace really does
      contain two `PEE-1`. Listing them is still the right answer: the caller
      needs to see that the identifier they trusted is not an identifier.
    */
    const candidates = (exact.length > 1 ? exact : partial).slice(0, MAX_CANDIDATES)
    const shown = candidates.map((item) => `  ${how.label(item)}`).join('\n')
    const total = exact.length > 1 ? exact.length : partial.length
    const more = total > candidates.length ? `\n  …and ${total - candidates.length} more` : ''
    throw new BadRequest(`"${reference}" matches ${total} ${how.noun}s:\n${shown}${more}`)
  }

  throw new BadRequest(`No ${how.noun} matches "${reference}".`)
}
