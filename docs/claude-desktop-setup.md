# Reading Estiva from Claude Desktop

Set-up for one person, start to finish. Two halves: an **admin** creates an
identity in Estiva ID, and **you** install one file.

Expect 15 minutes. Almost all of it is waiting for an admin.

## What you are getting

Claude Desktop gains tools for the team's Ship workspace: list issues, read one
in full, and — if your credential allows it — comment, set a status, assign, and
file an issue. It reads and writes **production**. There is no staging
workspace.

**What you can do is decided by your credential, not by this software.** The
tools are always present; a credential minted for reading only will have its
writes refused by Estiva ID, server-side, before anything reaches the relay. If
Claude tells you it could not close an issue, believe it and ask your admin what
your identity is allowed to sign.

**No signing key touches your laptop.** The key lives in Estiva ID. Your machine
holds a client secret, exchanges it for a short-lived token, and asks Estiva ID
to sign. Losing your laptop does not leak a key; it leaks a credential an admin
can disable in one action.

---

## Part 1 — an admin does this

In `id.estiva.app`, signed in as an admin. Nothing in Part 2 works until all
three steps are done.

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
| Kinds it may sign | `27235` for a reader; add Ship's kinds to allow writes |
| Where it may authenticate | *leave blank* |

`27235` is NIP-98 HTTP auth — the header every request carries. A credential
holding only that can authenticate and read, and cannot publish anything,
**by construction rather than by promise**. Blank destinations resolve to
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

You need Claude Desktop. **You do not need Node, git, a terminal, or a copy of
this repository.**

### 1. Install the extension

Get `estiva-agent.mcpb` from whoever set you up, and open it. Claude Desktop
recognises the file and offers to install it.

### 2. Enter your credential

Desktop asks for the **client id** and **client secret** from Part 1 step 2, and
shows two more fields already filled in — leave those alone unless an admin says
otherwise.

The secret goes into your operating system's keychain, masked on screen. It is
never written into `claude_desktop_config.json`, which is plain text and gets
copied between machines and pasted into bug reports.

### 3. Ask whether it is connected

> Is the Estiva connection working?

This calls `estiva_ping`, which walks every hop between your credential and the
relay and names the one that broke. **Do this before asking a real question.** A
workspace question that comes back empty looks the same whether the workspace is
quiet or your identity was never admitted, and those have completely different
fixes.

A healthy answer names the identity you sign as and the relay you are reading.

### 4. Ask it something real

> What issues are open in the Peek Feedback project?

A good answer names issues **and** mentions that some are unreachable. That
caveat is real — see below.

---

## Two things worth knowing before you trust an answer

**The list is not always everything.** Issues whose project no longer resolves
cannot be discovered, so a listing carries a `coverage` block saying how many it
could not reach. At the time of writing that is 13 of 31. `ship.estiva.app` has
the same blind spot, so this is a limit of the discovery model rather than a bug
in the tool. If Claude says "this may not be complete", believe it.

**Issue refs like `PEE-1` are not unique.** They are display keys generated from
what a client could see at the time, and the workspace contains two `PEE-1`. Ask
by title when it matters, and if Claude comes back with a list of candidates
rather than an answer, pick one — it is refusing to guess on purpose.

---

## When it does not work

Ask **"is the Estiva connection working?"** first. `estiva_ping` reports which
hop broke, and each one sends you somewhere different:

| `failed` | What it means | Who fixes it |
| --- | --- | --- |
| `credentials` | Desktop is not passing a client id and secret to the extension. | You, in the extension's settings |
| `token` with `invalid_client` | Wrong or replaced secret. Re-issuing a credential replaces the old one, so a secret that worked yesterday failing today is expected. | An admin, by re-issuing |
| `token` otherwise | The identity service could not be reached. | An admin |
| `relay` with `relay_membership_required` | Signing works; the pubkey was never admitted. Part 1 step 3. | An admin |
| `relay` with `nip98` | Estiva ID declined to mint auth, so nothing reached the relay. The credential's allowed destinations are wrong. | An admin |

If the tools do not appear in Claude Desktop at all, the extension did not
launch. Desktop's own logs:

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Logs/Claude/` |
| Windows | `…\LocalCache\Roaming\Claude\logs\` |

`main.log` records whether the extension was started — search for `estiva`.

---

## The other route: running it from a clone

For developing the server, or if you have been asked to run an unreleased
version. This is the older path and it has more ways to go wrong.

You need [Node.js](https://nodejs.org) 22 or newer and `git`.

```bash
git clone https://github.com/estiva-app/ship.git estiva-ship
cd estiva-ship
npm install
printf 'ESTIVA_ID_CLIENT_ID=claude-yourname\nESTIVA_ID_CLIENT_SECRET=the-secret-you-were-sent\n' > ~/.estiva-agent.env
chmod 600 ~/.estiva-agent.env
npm run probe:agent
```

The probe walks the same four hops `estiva_ping` does and prints them. Expect
four ticks and a count of events.

Then point Desktop at `scripts/mcp-server.sh` in `claude_desktop_config.json`:

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows (installed from an `.exe`) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Windows (Microsoft Store build) | `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\claude_desktop_config.json` |

The Store build is the one that catches people out: it is an MSIX package, so
its writes to `%APPDATA%` are redirected into the package container. The
documented path is correct *and* the folder is empty. If `%APPDATA%\Claude` does
not exist, you have the Store build.

**macOS and Linux:**

```json
{
  "mcpServers": {
    "estiva": { "command": "/Users/you/estiva-ship/scripts/mcp-server.sh" }
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

Replace `Ubuntu` with your distro from `wsl.exe -l -q`. Point at
`scripts/mcp-server.sh`, not at `node` — `wsl.exe -e` runs a program directly
with no login shell, so nvm and `node` are not on the path. The script finds
them. An absolute path to nvm's node also carries the version number in it, so
it breaks silently the next time you upgrade Node.

**None of this applies to the extension.** A packaged extension is launched by
Desktop's own Node on the host, so there is no distro to name, no nvm to source,
and no path that breaks on the next upgrade — the WSL boundary is removed rather
than crossed.

### Building the extension

```bash
npm run extension:pack
```

Writes `extension/estiva-agent.mcpb`. `npm test` builds the same bundle and
drives it over stdio with no credentials, which is also every new install's
first-run state.

---

## Getting stuck is a bug in this document

If you had to guess, ask someone, or fix something this page did not mention,
say so on PEEK-160 with what you actually saw. A runbook nobody has walked is a
draft, and the first walk is the only cheap chance to find what it assumes.
