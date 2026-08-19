/**
 * Signing as a service identity, from a process with no person in it.
 *
 * `estivaIdSigner` already holds the shape this needs — it takes a token and a
 * `renew` callback and never sees a key. What it does not do is *obtain* a
 * token, because in the browser that is the sign-in flow's job. A bot has
 * nobody to sign in, so its token comes from the client-credentials grant
 * instead: an app authenticates as itself with a secret and receives a
 * short-lived token for the role identity it is registered to act as.
 *
 * The secret is exchanged for a token rather than *being* one, which is what
 * keeps a short TTL meaningful. It also makes anything using this a
 * **confidential client** — server-side only. A secret in a browser bundle is
 * not a secret, and this module has no business running there.
 *
 * ## The renewal is the point
 *
 * The TTL is `JWT_TTL_SECONDS` on the identity service, and **the number is not
 * what the code's default suggests**: the default is 600, and production was
 * measured issuing 3600. Do not hardcode either — read `expires_in`, which is
 * why nothing here states a duration.
 *
 * Whatever it is, it is shorter than plenty of useful work. Without a `renew`, a
 * long read fails partway through with `SignerTokenExpired` and nothing on
 * screen explaining why — the exact failure PEEK-108 fixed on the browser side,
 * which had shipped with no handler for that error at all. Repeating it here
 * would be repeating a known bug in a place where nobody is watching a screen.
 *
 * So renewal is wired in by construction rather than offered as an option.
 * There is no way to build one of these without it.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { estivaIdSigner, type Signer } from '../nostr/signer'

export interface ServiceCredentials {
  clientId: string
  clientSecret: string
  /** Origin of the identity service. Defaults to `ESTIVA_ID_BASE`. */
  base?: string
}

/** Credentials with the default already applied, so callers need no `??`. */
export interface ResolvedCredentials extends ServiceCredentials {
  base: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  /** The role identity this token signs as — `sub` in the JWT. */
  pubkey: string
  expires_in?: number
}

const DEFAULT_ID_BASE = 'https://id.estiva.app'

const trimSlashes = (url: string) => url.replace(/\/+$/, '')

/**
 * Exchange a client id and secret for a short-lived token.
 *
 * A `401` here is nearly always a rotated secret rather than a typo: re-issuing
 * a credential for an identity **replaces** the old one, so a secret that
 * worked yesterday failing today is the expected shape of that, not a mystery.
 */
export async function clientCredentialsToken({
  clientId,
  clientSecret,
  base = DEFAULT_ID_BASE,
}: ServiceCredentials): Promise<TokenResponse> {
  const response = await fetch(`${trimSlashes(base)}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grantType: 'client_credentials', clientId, clientSecret }),
  })

  const text = await response.text()
  if (!response.ok) {
    let detail = text.slice(0, 200)
    try {
      const body = JSON.parse(text) as { error?: { message?: string } }
      detail = body.error?.message ?? detail
    } catch {
      // keep the raw text
    }
    throw new Error(`POST /token → ${response.status} ${detail}`)
  }
  return JSON.parse(text) as TokenResponse
}

/**
 * A `Signer` backed by a service credential, renewing itself as it goes.
 *
 * `Store` cannot tell this from a signed-in person's signer or from a local
 * secret key, which is the whole point of the seam — nothing in `src/` changes
 * to support an agent.
 *
 * The `pubkey` comes from the token rather than from configuration. A caller
 * does not get to declare whose signature it will receive; the identity service
 * decides that from the credential, and disagreeing with it would only produce
 * events the relay rejects as unsigned by their author.
 */
export async function serviceIdentitySigner(
  credentials: ServiceCredentials,
  /**
   * Observation only. A renewal is invisible by design — that is the feature —
   * which also makes it impossible to prove it ever happened. `scripts/
   * agent-renewal-soak.ts` uses this to watch for one across a real TTL.
   */
  { onRenew }: { onRenew?: (ok: boolean) => void } = {},
): Promise<Signer> {
  const base = trimSlashes(credentials.base ?? DEFAULT_ID_BASE)
  const first = await clientCredentialsToken({ ...credentials, base })

  return estivaIdSigner({
    base,
    pubkey: first.pubkey,
    token: first.access_token,
    /*
      Called by `estivaIdSigner` on a 401, once per signature and never twice —
      a second 401 after a successful renewal is a token the service will not
      accept, and retrying that in a loop turns one refused signature into a hot
      loop against the identity service.

      Returning `null` rather than throwing keeps a renewal failure reported as
      the expiry it is, instead of replacing it with whatever went wrong here.
    */
    renew: async () => {
      try {
        const renewed = await clientCredentialsToken({ ...credentials, base })
        onRenew?.(true)
        return renewed.access_token
      } catch {
        onRenew?.(false)
        return null
      }
    },
  })
}

/**
 * Where the credentials file lives when nothing says otherwise.
 *
 * A file rather than only environment variables, because the client that
 * matters cannot set environment variables. Claude Desktop launches this server
 * with `wsl.exe -e`, which runs a program directly — no login shell, no
 * profile, nothing exported. A server that could only read `process.env` would
 * work from every terminal and fail in the one place it is actually used.
 *
 * Kept out of `claude_desktop_config.json` deliberately (PEEK-158). That file is
 * plaintext, gets copied between machines and pasted into bug reports; a path is
 * safe there in a way a secret is not.
 */
const DEFAULT_CREDENTIALS_FILE = '.estiva-agent.env'

/** `KEY=value` lines, `#` comments, optional surrounding quotes. */
function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at <= 0) continue
    const key = trimmed.slice(0, at).trim()
    let value = trimmed.slice(at + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

/**
 * The credential this process was given, from the environment or from a file.
 *
 * The environment wins when both are present, so a terminal can override the
 * file without editing it.
 *
 * ## The refusal describes state, it does not issue instructions
 *
 * An earlier version of this told the caller to run
 * `set -a; . ~/.estiva-agent.env; set +a`. Claude Desktop read that, correctly
 * identified shell commands arriving through tool output as indistinguishable
 * from a prompt injection, and refused to act on it — which is exactly what a
 * model should do with instructions that did not come from its user.
 *
 * So error text here states what was looked for and where, and says plainly
 * that the fix is not available from inside a conversation. **Never put a
 * command to run into anything that reaches a model.** The same rule applies to
 * every message in `scripts/mcp-server.ts`.
 */
export function loadCredentials(env: NodeJS.ProcessEnv = process.env): ResolvedCredentials {
  const fromEnv = {
    clientId: env.ESTIVA_ID_CLIENT_ID?.trim(),
    clientSecret: env.ESTIVA_ID_CLIENT_SECRET?.trim(),
    base: env.ESTIVA_ID_BASE?.trim(),
  }

  const home = env.HOME ?? homedir()
  const file = env.ESTIVA_AGENT_ENV_FILE?.trim() || join(home, DEFAULT_CREDENTIALS_FILE)

  let fromFile: Record<string, string> = {}
  let fileState: 'read' | 'absent' | 'unreadable' = 'absent'
  if (existsSync(file)) {
    try {
      fromFile = parseEnvFile(readFileSync(file, 'utf8'))
      fileState = 'read'

      /*
        Advisory only, and on stderr. A secret readable by every account on the
        machine is worth saying out loud, but refusing to start over it would
        strand somebody whose filesystem cannot represent the permission at all
        — /mnt/c under WSL being exactly that case.
      */
      const mode = statSync(file).mode & 0o077
      if (mode !== 0) {
        console.error(`estiva: ${file} is readable by others (mode ${(statSync(file).mode & 0o777).toString(8)})`)
      }
    } catch {
      fileState = 'unreadable'
    }
  }

  const clientId = fromEnv.clientId || fromFile.ESTIVA_ID_CLIENT_ID
  const clientSecret = fromEnv.clientSecret || fromFile.ESTIVA_ID_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    const where = {
      read: `a credentials file exists at ${file} but does not define both values`,
      absent: `no credentials file at ${file}`,
      unreadable: `a credentials file at ${file} could not be read`,
    }[fileState]

    throw new Error(
      'No Estiva credentials are available to this process. ' +
        'ESTIVA_ID_CLIENT_ID and ESTIVA_ID_CLIENT_SECRET are unset in the environment, and ' +
        `${where}. ` +
        'This is local machine setup on the host running the server, and it cannot be ' +
        'resolved from within a conversation.',
    )
  }

  return {
    clientId,
    clientSecret,
    base: fromEnv.base || fromFile.ESTIVA_ID_BASE || DEFAULT_ID_BASE,
  }
}
