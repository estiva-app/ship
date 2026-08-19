/**
 * Drive the MCP server over stdio, the way a client does.
 *
 * Claude Desktop is not installable everywhere this repo is worked on, and it
 * hides protocol errors when it is. So the server's half of the conversation is
 * proven here — spawn it, speak JSON-RPC at it, check the replies — and what is
 * left for a real client is only whether it can *launch* the process.
 *
 * Splitting it that way means a failure in Desktop has one remaining cause. If
 * these checks pass and Desktop still shows nothing, the problem is the command
 * line in `claude_desktop_config.json`, not the server.
 *
 *   npx tsx scripts/mcp-server.test.ts
 *
 * No credentials, no network, no relay.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

let failures = 0
function check(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

interface Rpc {
  id?: number
  result?: Record<string, unknown>
  error?: { message?: string }
}

/**
 * Send a batch of requests and collect the replies.
 *
 * Framing is line-delimited JSON, which is what `StdioServerTransport` speaks.
 * Replies are matched by id rather than by order, because nothing guarantees a
 * server answers in the sequence it was asked.
 */
function converse(messages: unknown[]): Promise<{ replies: Map<number, Rpc>; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Spawned through tsx's own entry rather than a shell, so the command is
    // the same shape Claude Desktop will use: an executable and arguments, no
    // shell expansion in between.
    const tsx = join(here, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs')
    const child = spawn(process.execPath, [tsx, join(here, 'mcp-server.ts')], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const replies = new Map<number, Rpc>()
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      for (const line of stdout.split('\n').slice(0, -1)) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line) as Rpc
          if (parsed.id !== undefined) replies.set(parsed.id, parsed)
        } catch {
          // A non-JSON line on stdout is itself the failure this test looks
          // for, so keep it rather than discarding it.
          replies.set(-1, { error: { message: `non-JSON on stdout: ${line.slice(0, 80)}` } })
        }
      }
      stdout = stdout.slice(stdout.lastIndexOf('\n') + 1)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)

    for (const message of messages) child.stdin.write(`${JSON.stringify(message)}\n`)

    // Long enough for a cold tsx start; the process is killed rather than
    // waited on, because a server that exits by itself is already wrong.
    setTimeout(() => {
      child.kill()
      resolve({ replies, stderr })
    }, 8000)
  })
}

async function main() {
  const { replies, stderr } = await converse([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'estiva-selftest', version: '0' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'estiva_ping', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'no_such_tool', arguments: {} } },
  ])

  check('nothing but JSON-RPC reached stdout', !replies.has(-1), replies.get(-1)?.error?.message)

  const initialize = replies.get(1)
  check('handshake completes', Boolean(initialize?.result), initialize?.error?.message)
  check(
    'server names itself',
    (initialize?.result?.serverInfo as { name?: string } | undefined)?.name === 'estiva',
  )

  const list = replies.get(2)
  const tools = (list?.result?.tools ?? []) as Array<{ name: string; description?: string }>
  const named = (name: string) => tools.find((tool) => tool.name === name)

  check('advertises the read tools and the ping', tools.length === 3, tools.map((t) => t.name).join(', '))
  check('ship_list_issues is offered', Boolean(named('ship_list_issues')))
  check('ship_get_issue is offered', Boolean(named('ship_get_issue')))

  /*
    Descriptions are load-bearing here, not decoration.

    Claude Code reads CLAUDE.md; Claude Desktop reads nothing. Three facts that
    turn a correct-looking answer into a wrong one live only in these strings,
    so their absence is a functional regression rather than a style lapse:

      - the list can be incomplete, and `coverage` says by how much
      - display refs collide, so `addr` is the identity
      - writing is impossible by construction, so a refusal is not a fault

    Asserted by substring because the exact wording will be edited and should
    be; what must not happen is somebody trimming a description and silently
    removing the only warning a Desktop user will ever see.
  */
  const listing = named('ship_list_issues')?.description ?? ''
  check('the listing warns it may be incomplete', listing.includes('coverage'))
  check('and says refs are not unique', listing.toLowerCase().includes('not unique'))
  check('and says it cannot write', listing.toLowerCase().includes('read-only'))

  const get = named('ship_get_issue')?.description ?? ''
  check('the getter explains ambiguity is returned, not guessed', get.includes('candidates'))

  const ping = replies.get(3)
  const text = ((ping?.result?.content ?? []) as Array<{ text?: string }>)[0]?.text ?? ''
  /*
    Parsed rather than string-matched: the ping returns JSON now, and a tool
    whose output cannot be parsed is one a model has to guess at.
  */
  let pingBody: { ok?: boolean } = {}
  try {
    pingBody = JSON.parse(text) as { ok?: boolean }
  } catch {
    // leaves ok undefined, which fails the check below with the raw text shown
  }
  check('estiva_ping answers with parseable JSON', pingBody.ok === true, text.slice(0, 60))

  /*
    An unknown tool must come back as a tool *result* flagged as an error, not
    as a JSON-RPC error. The model can read the former and correct itself; the
    latter is opaque to it and surfaces to a person as a dead conversation.
  */
  const unknown = replies.get(4)
  check('an unknown tool is a readable result, not a protocol error', unknown?.error === undefined)
  check('and it is marked as an error', unknown?.result?.isError === true)

  check('startup diagnostics go to stderr', stderr.includes('ready'), stderr.trim().slice(0, 60))

  console.log(failures === 0 ? '\nAll MCP server checks passed.' : `\n${failures} failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
