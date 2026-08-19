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
import { loadCredentials, serviceIdentitySigner } from './credentials'

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
  const relayUrl = (process.env.RELAY_URL ?? 'https://estiva.estiva.app').replace(/\/+$/, '')
  const signer = await serviceIdentitySigner(loadCredentials())
  return { relay: new Relay(relayUrl, signer), signer, relayUrl }
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
