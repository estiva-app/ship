/**
 * The half of the agent CLI that knows nothing about any app.
 *
 * Ship is the first app an agent reads here, not the only one. Peek is already
 * live on the same relay and a third is coming, and all of them share one
 * relay, one identity service and one profile directory — apps sharing no code
 * and no database working on the same data is the ecosystem's whole claim.
 *
 * So the split is drawn here, while there is exactly one implementation to get
 * wrong:
 *
 *   **generic** — credentials, signing, NIP-98, the relay, argument parsing,
 *   output and exit codes. Nothing in this file may name a kind, a tag or an
 *   object type. If it does, the seam has already leaked.
 *
 *   **per app** — which kinds exist, how to fold them, and what an object looks
 *   like when printed. One module each, registered below.
 *
 * The test of whether this worked is not that it reads well: it is that adding
 * Peek touches no file in `lib/agent/` except the registry it is added to.
 */
import type { Signer } from '../nostr/signer'
import { Relay } from '../nostr/relay'
import { clientCredentialsToken, loadCredentials, serviceIdentitySigner } from './credentials'

/** What every command is handed. Deliberately free of app concepts. */
export interface AgentContext {
  relay: Relay
  signer: Signer
  relayUrl: string
}

export interface ParsedArgs {
  /** Everything that was not a `--flag`, in order. */
  positional: string[]
  /** `--key value` and bare `--flag` (which reads as `true`). */
  flags: Record<string, string | true>
}

export interface AgentCommand {
  name: string
  summary: string
  /** Shown in `--help`, e.g. `show <ref>`. */
  usage?: string
  /**
   * Return anything JSON-serialisable. Printing, exit codes and error shape are
   * the runner's job, so a command never calls `process.exit` or `console.log`
   * — a command that prints is a command that cannot be reused by an MCP tool
   * later without being rewritten.
   */
  run(context: AgentContext, args: ParsedArgs): Promise<unknown>
}

export interface AgentApp {
  name: string
  summary: string
  commands: AgentCommand[]
  /**
   * A filter that proves relay reads work, supplied by the app because this
   * file may not name a kind.
   *
   * Not a stylistic concession to the seam — the relay refuses a filter with no
   * `kinds` outright (`restricted: p-gated kinds require #p tag matching your
   * pubkey`), so there is no app-agnostic query to fall back on. A connection
   * check has to ask for something in particular, and only the app knows what.
   */
  probe?: Record<string, unknown>[]
}

/**
 * Raised by a command when the input was wrong rather than the world.
 *
 * Separated so the runner can tell "you asked for something impossible" from "a
 * remote service failed", which are different things for whoever is reading and
 * would otherwise both arrive as a bare stack trace.
 */
export class BadRequest extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadRequest'
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    // A following token that is itself a flag means this one is a boolean —
    // `--archived --project x` must not read as `archived: '--project'`.
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i++
    }
  }
  return { positional, flags }
}

/** A flag's value, refusing a bare `--flag` where a value was required. */
export function flagValue(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name]
  if (value === true) throw new BadRequest(`--${name} needs a value`)
  return value
}

function usage(apps: AgentApp[]): string {
  const lines = ['Read the Estiva workspace as a service identity.', '']
  for (const app of apps) {
    lines.push(`  ${app.name} — ${app.summary}`)
    for (const command of app.commands) {
      lines.push(`    ${(command.usage ?? command.name).padEnd(34)} ${command.summary}`)
    }
    lines.push('')
  }
  lines.push('Credentials come from the environment:')
  lines.push('  set -a; . ~/.estiva-agent.env; set +a')
  return lines.join('\n')
}

/**
 * Build the relay connection every command shares.
 *
 * Separate from `run` so a future MCP server can obtain a context once and hold
 * it across many tool calls, rather than paying a token exchange per call.
 */
export async function connect(): Promise<AgentContext> {
  const signer = await serviceIdentitySigner(loadCredentials())
  return { relay: new Relay(relayUrl(), signer), signer, relayUrl: relayUrl() }
}

/**
 * The relay to read, treating a blank value as unset.
 *
 * `??` was wrong here and the Desktop extension is what exposes it: a packaged
 * extension injects **every** declared setting into the environment, so an
 * optional field nobody filled in arrives as `RELAY_URL=""` rather than absent.
 * Nullish coalescing keeps the empty string, and the whole read then fails
 * against an empty URL — a configuration screen left untouched breaking the
 * only thing the extension does.
 */
export const DEFAULT_RELAY_URL = 'https://estiva.estiva.app'

function relayUrl(): string {
  const configured = process.env.RELAY_URL?.trim()
  return (configured || DEFAULT_RELAY_URL).replace(/\/+$/, '')
}

/** One hop of the connection check, and whether it held. */
export interface StatusHop {
  hop: 'credentials' | 'token' | 'relay'
  ok: boolean
  detail: string
}

export interface ConnectionStatus {
  ok: boolean
  /** The hop that broke, absent when everything held. */
  failed?: StatusHop['hop']
  identityService: string
  relayUrl: string
  /** The role identity this credential signs as, once a token has proved it. */
  signsAs?: string
  hops: StatusHop[]
  summary: string
}

/**
 * Walk every hop between a credential and a relay read, and name the one that broke.
 *
 * This is `scripts/probe-agent.ts` as a tool rather than as a terminal command,
 * and packaging is why it has to exist. The runbook's most valuable instruction
 * was "run the probe before involving Claude Desktop", because it separates
 * "my client is misconfigured" from "my identity was never admitted" — two
 * problems that are indistinguishable from inside a conversation and have
 * completely different fixes. An extension deliberately removes the terminal,
 * the clone and the probe along with them, so the diagnosis has to be reachable
 * from the one surface that is left.
 *
 * Every string it produces describes state. None of them tells anybody to run
 * anything: this output reaches a model as untrusted text like any other tool
 * result, and `docs/untrusted-content.md` is the incident that taught us so.
 */
export async function connectionStatus(app: AgentApp): Promise<ConnectionStatus> {
  const hops: StatusHop[] = []
  const relay = relayUrl()
  const done = (
    ok: boolean,
    summary: string,
    extra: Partial<ConnectionStatus> = {},
  ): ConnectionStatus => ({
    ok,
    failed: ok ? undefined : hops.find((h) => !h.ok)?.hop,
    identityService: extra.identityService ?? 'unknown',
    relayUrl: relay,
    hops,
    summary,
    ...extra,
  })

  let credentials
  try {
    credentials = loadCredentials()
    hops.push({
      hop: 'credentials',
      ok: true,
      detail: `client id "${credentials.clientId}" is configured`,
    })
  } catch (error) {
    hops.push({
      hop: 'credentials',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    })
    return done(
      false,
      'Not configured. No client id and secret are available to this process, so nothing has been attempted. ' +
        'They are issued by an Estiva ID administrator and entered into this connection\'s own settings; ' +
        'neither step can be carried out from inside a conversation.',
    )
  }

  let token
  try {
    token = await clientCredentialsToken(credentials)
    hops.push({ hop: 'token', ok: true, detail: `signs as ${token.pubkey}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    hops.push({ hop: 'token', ok: false, detail: message })
    return done(
      false,
      message.includes('invalid_client')
        ? 'The identity service rejected this client id and secret. Re-issuing a credential replaces the previous one, ' +
            'so a secret that worked before and fails now is the expected shape of that rather than a fault. ' +
            'A replacement comes from an Estiva ID administrator.'
        : `The identity service could not be reached or refused the credential at ${credentials.base}. Nothing reached the relay.`,
      { identityService: credentials.base },
    )
  }

  const filters = app.probe
  if (!filters) {
    return done(true, 'Credentials and signing work. Relay access was not checked: this app declares no probe.', {
      identityService: credentials.base,
      signsAs: token.pubkey,
    })
  }

  try {
    const context = await connect()
    const events = await context.relay.query(filters)
    hops.push({ hop: 'relay', ok: true, detail: `read ${events.length} event(s)` })
    return done(true, `Connected. Signing as ${token.pubkey} and reading ${relay}.`, {
      identityService: credentials.base,
      signsAs: token.pubkey,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    hops.push({ hop: 'relay', ok: false, detail: message })

    /*
      The two remote refusals that look identical from a conversation and are
      not. Naming them is the difference between somebody asking an admin for
      relay admission and somebody reinstalling a working extension.
    */
    let summary = `The relay at ${relay} refused the read. Signing worked, so this is not a credential problem.`
    if (message.includes('relay_membership_required')) {
      summary =
        `Signing works and the relay refused the read: this identity (${token.pubkey}) has never been admitted to ${relay}. ` +
        'Admission is an action an Estiva ID administrator takes on the identity, and it is not available from inside a conversation.'
    } else if (message.includes('nip98')) {
      summary =
        'The identity service declined to mint the authentication header, so no request reached the relay. ' +
        'The cause is which destinations this credential is allowed to authenticate to, which is server-side configuration an administrator holds.'
    }
    return done(false, summary, { identityService: credentials.base, signsAs: token.pubkey })
  }
}

/**
 * Parse, dispatch, print, exit.
 *
 * Output is indented JSON on stdout and nothing else, so a caller can pipe it
 * without stripping banners. Diagnostics go to stderr for the same reason.
 */
export async function run(apps: AgentApp[], argv: string[]): Promise<never> {
  const args = parseArgs(argv)
  const [appName, commandName] = args.positional

  if (!appName || args.flags.help) {
    console.error(usage(apps))
    process.exit(appName ? 0 : 1)
  }

  const app = apps.find((candidate) => candidate.name === appName)
  if (!app) {
    console.error(`Unknown app "${appName}". Known: ${apps.map((a) => a.name).join(', ')}`)
    process.exit(1)
  }

  const command = app.commands.find((candidate) => candidate.name === commandName)
  if (!command) {
    console.error(
      commandName
        ? `Unknown command "${appName} ${commandName}".`
        : `"${appName}" needs a command.`,
    )
    console.error(`Available: ${app.commands.map((c) => c.name).join(', ')}`)
    process.exit(1)
  }

  try {
    const context = await connect()
    // The app and command names are consumed here so a command sees only its
    // own arguments — `show <ref>` reads positional[0], not positional[2].
    const result = await command.run(context, {
      ...args,
      positional: args.positional.slice(2),
    })
    console.log(JSON.stringify(result, null, 2))
    process.exit(0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(error instanceof BadRequest ? message : `Failed: ${message}`)

    /*
      Two failures worth naming, because they are the ones that will actually
      happen and each sends you somewhere different — the same distinction
      `scripts/probe-agent.ts` draws, kept here so a CLI user is not told to go
      and run a second tool to find out which they hit.
    */
    if (message.includes('relay_membership_required')) {
      console.error('The signing identity is not a relay member. Admission, not signing.')
    }
    if (message.includes('nip98')) {
      console.error('Estiva ID refused to mint NIP-98. Nothing ever reached the relay.')
    }
    process.exit(1)
  }
}
