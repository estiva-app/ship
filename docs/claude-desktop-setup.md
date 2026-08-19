# Reading Estiva from Claude Desktop

Set-up for one person, start to finish. Two halves: an **admin** creates an
identity in Estiva ID, and **you** point Claude Desktop at a local server.

Expect 15 minutes. Most of it is waiting for an admin.

## What you are getting, and what you are not

Claude Desktop gains two tools: list Ship issues, and read one in full. It reads
**production** — there is no staging workspace.

It **cannot write anything.** Not a comment, not a status change, not a new
issue. That is not a missing feature to be added later by editing this repo: the
credential you are given may sign exactly one kind of thing (NIP-98 HTTP auth),
and Estiva ID refuses everything else server-side. If Claude tells you it cannot
close an issue, it is right.

**No signing key touches your laptop.** The key lives in Estiva ID. Your machine
holds a client secret, exchanges it for a short-lived token, and asks Estiva ID
to sign. Losing your laptop does not leak a key; it leaks a credential that an
admin can disable in one action.

---

## Part 1 — an admin does this

In `id.estiva.app`, signed in as an admin.

### 1. Create a service identity for *this person*

**Add a service identity** → Name it for the person, e.g. `Claude (Katerina)` →
**Create**.

**One identity per person. Do not share one.** Re-issuing a credential deletes
any other credential for the same identity, so two people on one identity means
whoever re-mints silently breaks the other — and the audit log cannot tell them
apart. A separate identity costs nothing and buys revoking one person without
disturbing anyone else.

### 2. Mint its credential

On the identity's page, **Service credential**:

| Field | Value |
| --- | --- |
| Client id | `claude-<name>`, lowercase letters, digits and dashes |
| Kinds it may sign | `27235` |
| Where it may authenticate | *leave blank* |

`27235` alone is what makes this read-only by construction. Blank resolves to
whatever the deployment allows, which is the relay.

**The secret is shown once.** Send it through a password manager — not chat, not
email. It is a bearer credential: anyone holding it can read the workspace as
that identity until it is revoked.

### 3. Admit the pubkey to the relay

Same page, **Admit**. The relay is closed, so until this happens every read
fails with `relay_membership_required`.

If the button is not there, the relay could not be reached — the identity's
admission state reads `unknown` rather than `not admitted`. That is a relay
problem, not a console one.

---

## Part 2 — you do this

You need [Node.js](https://nodejs.org) 22 or newer, `git`, and Claude Desktop.

### 1. Get the code

```bash
git clone https://github.com/estiva-app/ship.git estiva-ship
cd estiva-ship
npm install
```

> Cloning an issue-tracker repo to read issues is odd, and we know. The agent
> tooling lives here because that is where the protocol library already was;
> moving it into its own package is PEEK-155.

### 2. Save your credential

```bash
printf 'ESTIVA_ID_CLIENT_ID=claude-yourname\nESTIVA_ID_CLIENT_SECRET=the-secret-you-were-sent\n' > ~/.estiva-agent.env
chmod 600 ~/.estiva-agent.env
```

The server reads this file itself. Nothing needs to be exported, and the secret
never goes into Claude Desktop's config — that file is plaintext and gets copied
around.

### 3. Check it works *before* involving Claude Desktop

```bash
npm run probe:agent
```

Expect four ticks and a count of events. **Do this first.** Claude Desktop can
swallow a tool error, and this separates "my Desktop config is wrong" from "my
identity was never admitted" — two problems that look identical from inside a
conversation and have completely different fixes.

If it fails, jump to [When it does not work](#when-it-does-not-work).

### 4. Tell Claude Desktop about the server

Find `claude_desktop_config.json`:

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows (installed from an `.exe`) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Windows (Microsoft Store build) | `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\claude_desktop_config.json` |

The Store build is the one that catches people out: it is an MSIX package, so
its writes to `%APPDATA%` are redirected into the package container. The
documented path is correct *and* the folder is empty. If `%APPDATA%\Claude` does
not exist, you have the Store build.

**macOS and Linux** — add to `mcpServers`, using your own clone path:

```json
{
  "mcpServers": {
    "estiva": {
      "command": "/Users/you/estiva-ship/scripts/mcp-server.sh"
    }
  }
}
```

**Windows, with the repo inside WSL** — Desktop is a Windows app and has to
cross the boundary:

```json
{
  "mcpServers": {
    "estiva": {
      "command": "wsl.exe",
      "args": ["-d", "Ubuntu", "-e", "/home/you/estiva-ship/scripts/mcp-server.sh"]
    }
  }
}
```

Replace `Ubuntu` with your distro from `wsl.exe -l -q`.

Point at `scripts/mcp-server.sh`, not at `node` — `wsl.exe -e` runs a program
directly with no login shell, so nvm and `node` are not on the path. The script
finds them. An absolute path to nvm's node also carries the version number in
it, so it breaks silently the next time you upgrade Node.

### 5. Restart Claude Desktop and ask it something

> What issues are open in the Peek Feedback project?

A good answer names issues **and** mentions that some are unreachable. That
caveat is real — see below.

---

## Two things worth knowing before you trust an answer

**The list is not always everything.** Issues whose project no longer resolves
cannot be discovered, so a listing carries a `coverage` block saying how many it
could not reach. At the time of writing that is 13 of 27. `ship.estiva.app` has
the same blind spot, so this is a limit of the data model rather than a bug in
the tool. If Claude says "this may not be complete", believe it.

**Issue refs like `PEE-1` are not unique.** They are display keys generated from
what a client could see at the time, and the workspace contains two `PEE-1`. Ask
by title when it matters, and if Claude comes back with a list of candidates
rather than an answer, pick one — it is refusing to guess on purpose.

---

## When it does not work

Run `npm run probe:agent` first. It walks all four hops — token, sign, header,
query — and names the one that broke.

| What you see | What it means |
| --- | --- |
| `No Estiva credentials are available to this process` | The server cannot find `~/.estiva-agent.env`. Check the path and that it has both keys. |
| `invalid_client` | Wrong or rotated secret. Re-issuing a credential replaces the old one, so a secret that worked yesterday failing today is expected. |
| `relay_membership_required` | Signing works; the pubkey was never admitted. Part 1 step 3, an admin action. |
| `nip98_url_not_allowed` | Estiva ID declined to mint auth, so nothing reached the relay. The credential's allowed destinations are wrong. |

If the probe passes and Claude Desktop still shows nothing, the problem is the
config, not the server. Desktop's own logs:

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Logs/Claude/` |
| Windows | `…\LocalCache\Roaming\Claude\logs\` |

`main.log` records whether the server was launched at all — search for `estiva`.
`mcp-server-estiva.log` records protocol traffic, but **an empty one does not
mean nothing happened**: Desktop runs a separate process per surface and not all
of them write there.

A harmless line you will see either way:
`UtilityProcess Check: Extension estiva not found in installed extensions`. That
is Desktop checking whether this is a packaged extension before spawning a
process instead.

---

## Getting stuck is a bug in this document

If you had to guess, ask someone, or fix something this page did not mention,
say so on PEEK-160 with what you actually saw. A runbook nobody has walked is a
draft, and the first walk is the only cheap chance to find what it assumes.
