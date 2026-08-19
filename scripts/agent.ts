/**
 * The agent's way in.
 *
 * A CLI rather than an MCP server, deliberately and for now: Claude Code
 * already has a shell, so this needs no protocol, no configuration and no
 * server lifecycle, and a person can run the exact command the agent ran when
 * they want to know what it saw. An MCP wrapper over these same commands is
 * PEEK-151, and it earns its keep when a second client wants in — not before.
 *
 *   set -a; . ~/.estiva-agent.env; set +a
 *   npx tsx scripts/agent.ts ship issues --status todo
 *
 * Registering a second app is the whole of adding one:
 *
 *   run([shipApp, peekApp], process.argv.slice(2))
 */
import { run } from '../lib/agent/cli'
import { shipApp } from '../lib/agent/apps/ship'

void run([shipApp], process.argv.slice(2))
