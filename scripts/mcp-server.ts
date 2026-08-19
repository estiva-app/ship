/**
 * The Estiva MCP server — stdio, for Claude Desktop.
 *
 * **This file starts deliberately empty of Estiva.** PEEK-156 is a spike whose
 * only question is whether Claude Desktop can launch a server at all from this
 * machine, where Desktop is a Windows application and the toolchain lives in
 * WSL2. Mixing that question with credentials, signing and a relay would make a
 * failure unattributable — which is the exact trap milestone 1 fell into, where
 * a closed relay was indistinguishable from a broken client until it was
 * measured separately.
 *
 * So: one tool, `estiva_ping`, that returns a string and touches nothing. Once
 * Desktop can call it, PEEK-157 adds the two read tools to this same file, and
 * the Desktop config written for the spike keeps working — one configuration
 * step for a person, not two.
 *
 *   npx tsx scripts/mcp-server.ts        # speaks JSON-RPC on stdin/stdout
 *
 * ## stdout belongs to the protocol
 *
 * Anything written to stdout that is not JSON-RPC corrupts the stream, and the
 * symptom is a server that "does not work" with no error anywhere. Every
 * diagnostic here goes to stderr. Nothing in this file may `console.log`.
 *
 * The low-level `Server` is used rather than the ergonomic `McpServer` wrapper
 * so tools are declared with plain JSON Schema, which keeps this repo free of a
 * validation dependency it does not otherwise have.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const server = new Server(
  { name: 'estiva', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'estiva_ping',
      description:
        'Check that the Estiva MCP server is running and reachable. Takes no arguments and reads no data. Use it to confirm the connection before concluding that a missing answer means missing data.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'estiva_ping') {
    // An unknown tool is the caller's mistake, not a server fault, so it comes
    // back as a tool result rather than a protocol error — the model can read
    // this and correct itself, where a JSON-RPC error is opaque to it.
    return {
      isError: true,
      content: [{ type: 'text', text: `No such tool: ${request.params.name}` }],
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: `pong — Estiva MCP server reachable at ${new Date().toISOString()}, pid ${process.pid}`,
      },
    ],
  }
})

async function main() {
  await server.connect(new StdioServerTransport())
  // stderr, not stdout. This line is the only sign of life a person gets when
  // debugging from Claude Desktop's MCP logs.
  console.error(`estiva mcp server ready (pid ${process.pid})`)
}

main().catch((error) => {
  console.error(`estiva mcp server failed to start: ${(error as Error).message}`)
  process.exit(1)
})
