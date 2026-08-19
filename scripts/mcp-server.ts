/**
 * The Estiva MCP server — stdio, for Claude Desktop.
 *
 * Claude Desktop is the primary client; the CLI in `scripts/agent.ts` is the
 * same thing with a terminal in front of it, kept because Desktop hides errors
 * and a person needs somewhere to see them.
 *
 * ## This file must not know anything
 *
 * Every tool body dispatches to an `AgentCommand` — the same objects the CLI
 * runs. `run()` was written to return JSON-serialisable data and never print,
 * exactly so it could be reused here without a second implementation.
 *
 * The reviewable form of that claim: **there is no `fetch` in this file, no
 * relay URL, and no kind number.** If one appears, a second auth path is being
 * built and the shared contract has already been abandoned.
 *
 * ## stdout belongs to the protocol
 *
 * Anything written to stdout that is not JSON-RPC corrupts the stream, and the
 * symptom is a server that "does not work" with no error anywhere. Every
 * diagnostic goes to stderr, where Claude Desktop records it in
 * `logs/mcp-server-estiva.log`. Nothing here may `console.log`.
 *
 * ## Why the caveats are in the tool descriptions
 *
 * Claude Code reads `CLAUDE.md`. **Desktop reads nothing.** So the facts that
 * turn a correct-looking answer into a wrong one — partial reads, colliding
 * refs, writes being structurally impossible — have to travel in the tool
 * surface itself, or they cease to exist for the client that matters most.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { BadRequest, connect, type AgentContext, type ParsedArgs } from '../lib/agent/cli'
import { shipApp } from '../lib/agent/apps/ship'

const server = new Server({ name: 'estiva', version: '0.2.0' }, { capabilities: { tools: {} } })

/**
 * One relay connection per process, made on first use rather than at startup.
 *
 * Connecting eagerly would make a missing credential look like a server that
 * will not launch — Desktop shows no tools and says nothing useful. Lazily, the
 * tools appear and the first call explains itself, which is the difference
 * between a person fixing it in a minute and filing "MCP is broken".
 *
 * A failed attempt is **not** cached: somebody who creates the credential file
 * and asks again should succeed without restarting Desktop.
 */
let pending: Promise<AgentContext> | null = null
function context(): Promise<AgentContext> {
  if (!pending) {
    pending = connect().catch((error) => {
      pending = null
      throw error
    })
  }
  return pending
}

/** Look a command up by name, so this file never holds its own copy of one. */
function command(name: string) {
  const found = shipApp.commands.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`no such command: ${name}`)
  return found
}

const args = (flags: Record<string, string | true>, positional: string[] = []): ParsedArgs => ({
  positional,
  flags,
})

/** Drop absent optional arguments rather than passing them through as empty. */
function flagsFrom(input: Record<string, unknown>, names: string[]) {
  const flags: Record<string, string | true> = {}
  for (const name of names) {
    const value = input[name]
    if (typeof value === 'string' && value.trim() !== '') flags[name] = value.trim()
  }
  return flags
}

const READ_ONLY_NOTE =
  'This connection is read-only by construction: its credential may sign only NIP-98 HTTP auth, so it cannot create, edit, comment on or close anything. A refusal to write is the design, not a fault.'

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'ship_list_issues',
      description:
        'List issues in Estiva Ship, the team\'s issue tracker, newest first. Optionally filter by project or status. ' +
        'Returns { issues, coverage }. **Read `coverage` before summarising**: some issues are unreachable because the project they belonged to no longer resolves, and the list is not the whole workspace when `coverage.unreachable` is above zero. Say so rather than implying completeness. ' +
        'Issue refs such as PEE-1 are display keys and are not unique across projects; the `addr` field is the real identity. ' +
        READ_ONLY_NOTE,
      inputSchema: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: 'Project name or part of one, e.g. "Peek: Feedback". Omit for every project.',
          },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'done', 'cancelled'],
            description: 'Filter by status. Omit for all statuses.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'ship_get_issue',
      description:
        'Read one Estiva Ship issue in full: description, status, assignee, the change history showing who altered what and when, and any conversation on it. ' +
        'Accepts a display ref (PEE-1), a full address, or part of a title. ' +
        'If the reference matches more than one issue this returns the candidates instead of choosing — pick one and ask again rather than guessing, because the wrong issue is indistinguishable from the right one once reported. ' +
        READ_ONLY_NOTE,
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Display ref, address, or a distinctive fragment of the title.',
          },
        },
        required: ['ref'],
        additionalProperties: false,
      },
    },
    {
      name: 'estiva_ping',
      description:
        'Check that the Estiva connection is alive without reading any workspace data. Use it to tell "the connection is down" apart from "there is nothing to report", which look identical in an empty answer.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
  ],
}))

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
})

const failure = (message: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: message }],
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const input = (request.params.arguments ?? {}) as Record<string, unknown>

  try {
    switch (request.params.name) {
      case 'estiva_ping':
        return text({
          ok: true,
          at: new Date().toISOString(),
          pid: process.pid,
          note: 'Server reachable. This says nothing about relay access — call a read tool for that.',
        })

      case 'ship_list_issues':
        return text(
          await command('issues').run(await context(), args(flagsFrom(input, ['project', 'status']))),
        )

      case 'ship_get_issue': {
        const ref = typeof input.ref === 'string' ? input.ref : ''
        return text(await command('show').run(await context(), args({}, [ref])))
      }

      default:
        return failure(`No such tool: ${request.params.name}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    /*
      A BadRequest is the caller's mistake and carries something to act on — an
      ambiguous reference arrives here with its candidates listed. It goes back
      verbatim as a tool result rather than a protocol error, because a model
      can read a result and correct itself, where a JSON-RPC error is opaque to
      it and reaches a person as a conversation that simply stops.
    */
    if (error instanceof BadRequest) return failure(message)

    /*
      The two remote failures that look identical from here and are not. Naming
      them is the difference between a person fixing access and a person
      debugging an MCP server that is working perfectly.

      **Every string below states a fact and asks for nothing.** An earlier
      version told the caller to run `set -a; . ~/.estiva-agent.env; set +a`.
      Claude Desktop read that, recognised shell commands arriving through tool
      output as indistinguishable from a prompt injection, and refused — which
      is precisely what a model should do with instructions its user did not
      give. A tool that needs the operator to act says what is wrong and says
      the fix is not available here; it never supplies a command to run.
    */
    if (message.includes('relay_membership_required')) {
      return failure(
        `${message}\n\nThe signing identity is not a member of the relay, so signing succeeded and the read was refused. Resolving it is an administrative action in Estiva ID, not something available from this conversation.`,
      )
    }
    if (message.includes('nip98')) {
      return failure(
        `${message}\n\nEstiva ID declined to mint NIP-98 auth, so no request reached the relay. The cause is the credential's allowed URL prefixes or the deployment's, both of which are server-side configuration.`,
      )
    }
    return failure(message)
  }
})

async function main() {
  await server.connect(new StdioServerTransport())
  console.error(`estiva mcp server ready (pid ${process.pid})`)
}

main().catch((error) => {
  console.error(`estiva mcp server failed to start: ${(error as Error).message}`)
  process.exit(1)
})
