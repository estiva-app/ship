/**
 * What this build of Ship is pointed at. Decided when the bundle was built,
 * never at runtime — see vite.config.ts for why.
 */

/** The relay this bundle reads and writes. The relay URL *is* the workspace. */
export const RELAY_URL: string = __RELAY_URL__

/**
 * Estiva ID, or `null` when this build offers no sign-in at all.
 *
 * An empty `ID_BASE` is a real mode, not a broken one: the app runs
 * anonymous-only, reading what the relay lets an anonymous reader see and
 * signing nothing. Local builds are this by default, so a local build can
 * never reach production identity by accident.
 */
export const ID_CONFIG: { base: string; clientId: string } | null = __ID_BASE__
  ? { base: __ID_BASE__, clientId: __CLIENT_ID__ }
  : null

/** The relay as a person would name it in the UI: host and port, no scheme. */
export function workspaceLabel(relayUrl: string = RELAY_URL): string {
  try {
    return new URL(relayUrl).host
  } catch {
    return relayUrl
  }
}
