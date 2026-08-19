# Estiva Ship, for Claude Code

A minimal issue tracker — projects, issues, comments — built on Nostr. `README.md`
explains the design. This file is only about **reading the live workspace**.

## Read the workspace

```bash
set -a; . ~/.estiva-agent.env; set +a     # once per shell

npx tsx scripts/agent.ts ship projects
npx tsx scripts/agent.ts ship issues --project "Peek: Feedback" --status todo
npx tsx scripts/agent.ts ship show PEE-1
```

Output is indented JSON on stdout and nothing else, so it pipes. Diagnostics go
to stderr. Every failure exits non-zero.

`show` takes a display ref (`PEE-1`), a full address, or part of a title. **An
ambiguous fragment is refused with the candidates listed, never resolved to a
guess** — if you get that refusal, pick from the list rather than adding words
until something matches.

This reads **production**, `estiva.estiva.app`. There is no staging workspace.

## What you cannot do, and why it is not a bug

The agent signs as an Estiva ID **service identity** whose credential is scoped
to `allowedKinds: [27235]` — NIP-98 HTTP auth, and nothing else. So it can
authenticate to the relay and read, and it **cannot publish anything at all**:
no comment, no status change, no new issue. Estiva ID refuses server-side.

That is a property of the credential, not a gap in this CLI. Widening it is a
deliberate act on the identity in the console, not a code change here. Until
then, a refusal to write is the system working.

## When a read fails

| Message | What it means |
| --- | --- |
| `relay_membership_required` | The signing pubkey is not a relay member. Signing worked; the door is shut. Admission is an Estiva ID console action. |
| `nip98_url_not_allowed` | Estiva ID refused to mint NIP-98, so nothing ever reached the relay. The credential's URL prefixes, or the deployment's. |
| `invalid_client` | Wrong or rotated secret. Re-issuing a credential **replaces** the old one, so a secret that worked yesterday failing today is expected, not mysterious. |

`npx tsx scripts/probe-agent.ts` walks all four hops — token, sign, header,
query — and says which one broke. Run it before debugging anything else.

## Two things that will mislead you

**`issues` does not list every issue.** Discovery starts from projects and
widens into their Folders, so an issue whose project record no longer exists is
unreachable. On prod that was 13 of 27. `ship.estiva.app` has the same blind
spot — this is not a CLI defect — but it means **"all issues" means "all
discoverable issues"**, and answering "what is still open?" from this output
alone will be confidently incomplete. See PEEK-154.

**Display refs are not unique.** `nextRef` derives them from what a client could
see at the time, so the workspace contains two `PEE-1`, two `NEW-1` and two
`TES-1`. The address is the identity; the ref is decoration. Prefer the `addr`
when you need to be sure you are talking about the same object twice.

## Cost

`loadAll` pulls up to 2000 events and folds them on every call — no cache, by
design. Pass `--project` when you know the project. Three commands in a row is
three full scans, so gather what you need in one `show` rather than looping.

## If you are changing the agent tooling

The split is load-bearing and PEEK-143 exists to keep it:

- `lib/agent/cli.ts` — credentials, relay, argument parsing, output, exit codes.
  **Nothing here may name a kind, a tag or an object type.**
- `lib/agent/apps/ship.ts` — everything that knows Ship has projects and issues.
- `lib/agent/credentials.ts` — the client-credentials grant and the signer that
  renews itself. The token TTL is whatever `expires_in` says; do not hardcode it
  (the service default and production disagree).

Adding Peek is a sibling module plus one line in `scripts/agent.ts`. If a change
makes a second app touch a generic file, the seam has leaked.

Ship's module reads through `Store` and `foldFolder` rather than querying the
relay directly. The fold holds the subtle rules — change ordering, re-linked
Folders, a status set by someone who did not author the issue — and
reimplementing any of it would make the CLI disagree with the app, which is the
one thing it must not do.

### Tests

```bash
npm test                        # includes the offline agent checks
npx tsx scripts/agent-cli.test.ts       # parsing and reference resolution
npx tsx scripts/agent-signer.test.ts    # needs credentials — proves renewal fires
```

The tests that need live services are deliberately outside `npm test`: a suite
that cannot run without credentials is a suite nobody runs.
