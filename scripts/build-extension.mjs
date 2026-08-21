/**
 * Pack the MCP server into a Claude Desktop extension (`.mcpb`).
 *
 * The extension exists to delete a setup, not to add a feature. Today a second
 * person clones this repository, installs its dependencies, writes a secret into
 * a dotfile, finds `claude_desktop_config.json` — a different path on every
 * platform, and a redirected one on the Microsoft Store build — and hand-writes
 * a `wsl.exe` command line into it. Every one of those steps is a place to stop.
 * A bundle replaces all of them with opening a file.
 *
 * ## What the bundle contains, and what it deliberately does not
 *
 * `server/index.js` is `scripts/mcp-server.ts` and everything it imports, in one
 * file. Bundling rather than shipping `node_modules` is what makes the artefact
 * a single self-contained thing a person can be handed.
 *
 * **No credential is ever built in.** The manifest declares `user_config`
 * fields; Claude Desktop collects them, stores the secret in the OS keychain,
 * and injects them as environment variables at launch. `loadCredentials`
 * already prefers the environment over the file, so the packaged server reads
 * them with no code path of its own.
 *
 * ## The WSL boundary disappears rather than being crossed
 *
 * `scripts/mcp-server.sh` exists because Claude Desktop on Windows reaches a
 * repository inside WSL with `wsl.exe -e`, which runs a program with no login
 * shell and therefore no nvm and no node. A packaged extension is launched by
 * Desktop's own Node runtime on the host, so none of that applies: there is no
 * distro to name, no nvm to source, and no path that breaks on the next Node
 * upgrade. The server needs only outbound HTTPS to the identity service and the
 * relay, which a Windows process has exactly as much of as a WSL one.
 *
 * The shell wrapper stays for the repository-clone route, which is still how
 * anybody developing the server runs it.
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const OUT = 'extension/build'

if (existsSync(OUT)) rmSync(OUT, { recursive: true })
mkdirSync(`${OUT}/server`, { recursive: true })

await build({
  entryPoints: ['scripts/mcp-server.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  /*
    Matches `compatibility.runtimes.node` in the manifest. Claude Desktop
    supplies the runtime, so this is a floor for the oldest Desktop worth
    supporting rather than a description of any particular developer's machine.
  */
  target: 'node18',
  outfile: `${OUT}/server/index.js`,
  /*
    Kept, not stripped. They are the server's only channel for saying why it
    failed to start, they cost nothing in a file nobody reads, and Desktop
    records stderr in its own logs where a person can be pointed at it.
  */
  legalComments: 'none',
  banner: {
    js: '// Built from estiva-ship by scripts/build-extension.mjs. Edit the source, not this file.',
  },
})

/*
  The bundle is ESM and the file is `.js`, which Node reads as CommonJS unless
  something nearby says otherwise. Without this marker the extension installs
  cleanly and then fails at launch with a syntax error on its first `import` —
  a failure that appears only inside Claude Desktop's logs, in the one setup
  path whose whole purpose is that nobody has to open a terminal.
*/
writeFileSync(`${OUT}/server/package.json`, `${JSON.stringify({ type: 'module' }, null, 2)}\n`)

cpSync('extension/manifest.json', `${OUT}/manifest.json`)

const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'))
console.log(`built ${manifest.name} ${manifest.version} → ${OUT}/`)

/*
  Packing is optional so the build stays useful without a global install: an
  unpacked directory can be loaded by Desktop and is what the offline test
  drives. `mcpb` validates the manifest as it packs, which is the part worth
  having in CI.
*/
if (process.argv.includes('--pack')) {
  execFileSync('npx', ['--yes', '@anthropic-ai/mcpb', 'pack', OUT, 'extension/estiva-agent.mcpb'], {
    stdio: 'inherit',
  })
  console.log('packed → extension/estiva-agent.mcpb')
}
