/**
 * Serve `dist/` on :5190, but say something useful when the port is taken.
 *
 * `python3 -m http.server` dies with a nine-frame traceback ending in
 * `OSError: [Errno 98] Address already in use`, which looks like a broken build
 * and is not. The build has already run and succeeded by the time this starts,
 * and the server serves files from disk — so an already-running instance is
 * *already serving the new bundle*. There is nothing to fix and nothing to
 * restart. Say that instead of a stack trace.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const PORT = Number(process.env.PORT ?? 5190)
const URL = `http://localhost:${PORT}/linear-lite/`

/** Is something already listening? Bind and release rather than guess. */
function portInUse(port) {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', (error) => resolve(error.code === 'EADDRINUSE'))
    probe.once('listening', () => probe.close(() => resolve(false)))
    probe.listen(port, '0.0.0.0')
  })
}

if (await portInUse(PORT)) {
  console.log(`\n  Already serving on :${PORT} — and it picks files up from disk,`)
  console.log('  so the rebuild that just ran is already live. Nothing to restart.\n')
  console.log(`  →  ${URL}\n`)
  console.log(`  To take the port over: fuser -k ${PORT}/tcp && npm run serve\n`)
  process.exit(0)
}

console.log(`\n  →  ${URL}\n`)
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', 'dist'], {
  stdio: 'inherit',
})
server.on('exit', (code) => process.exit(code ?? 0))
