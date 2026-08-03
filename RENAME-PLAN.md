# Rename inventory: `linear-lite` → Estiva Ship

Parent brand **Estiva**; this app is **Ship**. UI copy says "Estiva Ship" on first
mention and "Ship" thereafter. Identifiers use `ship` or `estiva-ship`.

88 case-insensitive `linear` hits across 25 tracked files. Variant scan:

| Pattern | Files | Hits |
|---|---|---|
| `linear-lite` | 12 | 25 |
| `LINEAR_LITE` | 4 | 7 |
| `linear_lite` / `linearLite` / `LinearLite` | 0 | 0 |
| bare `Linear` (product-adjacent) | 3 | 4 |

## 1. Display strings — 5 files, 7 hits

`apps/linear-lite/index.html:6` (`<title>`), `:252` (`<h1>`);
`src/manifest.ts:99` (`name:` in the published NIP-89 manifest — what other apps
display); `src/store.ts:107` (`about: 'Linear-lite Folder'`), `:315`
(`'Posting from Linear-lite'`); `apps/linear-lite/app.ts:70` (fallback display name
`linear-lite-<pubkey6>`); `scripts/seed-for-peek.ts:73` (`'Linear-lite demo'`).

**Risk:** low in the DOM; the three `src/` strings are written into signed Nostr
events, so events already published keep the old text forever. Cosmetic drift, not
breakage.

## 2. Code identifiers — 0 files, 0 hits

No variable, type, class, function, or component contains `linear` in any casing. The
brand only ever appears as a string literal, a path, or prose.

**Risk:** none. This group is empty and needs no commit.

## 3. File & directory names — 1 directory, 13 files

`apps/linear-lite/` → `apps/ship/` (`app.ts`, `context.ts`, `index.html`, `router.ts`,
`ui.ts`, `views/`×7). `dist/linear-lite/` is gitignored build output and regenerates.

**Risk:** medium — `build.mjs` maps `apps/<name>/` → `dist/<name>/`, so this rename
changes the served URL path to `/ship/`. Cascades to `DEFAULT_APP_URL`, `serve.mjs`,
4 URLs in `smoke.ts`, and 2 imports in `app.test.ts`.

## 4. Package identifiers & import paths — 4 files, 8 hits

`package.json:2` and `package-lock.json:2,7` (`"name": "linear-lite"`);
`scripts/app.test.ts:17,18` (relative imports into `apps/linear-lite/`);
`scripts/seed-for-peek.ts:19–23` (five **absolute** imports `/home/miky/linear-lite/…`).

**Risk:** the absolute paths in `seed-for-peek.ts` encode the checkout directory, which
is *not* being renamed — they keep working, but they are fragile and should become
relative imports in a separate change.

## 5. Config & infra — 5 files, 9 hits

- `apps/linear-lite/app.ts:57,59` — localStorage keys `linear-lite.name`,
  `linear-lite.secretkey`.
- `src/manifest.ts:95` — `MANIFEST_D_TAG = 'linear-lite'`, the published NIP-89
  identifier.
- `src/manifest-address.ts:8` — `MANIFEST_ADDRESS` ends `:linear-lite`; a generated
  file, written by `scripts/publish-manifest.ts:83`.
- `src/manifest.ts:310` — `DEFAULT_APP_URL = 'http://localhost:5190/linear-lite/'`.
- `scripts/serve.mjs:15`, `scripts/smoke.ts:142,272,293` — the `/linear-lite/` URL path.
- `scripts/probe-kinds.ts:102,106` — throwaway `'linear-lite-probe'` d-tag.

No env vars, no database, no Docker, no CI config, no DNS in this repo. `RELAY_URL`
(`build.mjs`) is the only env var and is brand-neutral.

**Risk:** high for the two identifiers that outlive the code. The localStorage keys hold
the user's Nostr secret key; the manifest `d` tag is the address other apps already
point at. Both are handled deliberately below, not by find-and-replace.

## 6. False positives — never touch

- **`LINEAR_LITE_SPEC.md`** ×6 (`README.md:17`, `src/events.ts:8,100,149`,
  `src/manifest.ts:14,263`, `apps/linear-lite/views/new-issue.ts:84`) — a real file at
  `~/peek-app/docs/buzz-compat/LINEAR_LITE_SPEC.md`, **outside this repo**. Renaming the
  references breaks a working pointer.
- **`RFC_UPDATES.md` quotes** ×2 (`src/events.ts:43`, `src/store.ts:115`) — verbatim
  quotation: *"the Peek topic and the Linear project are the same Folder"*. Editing a
  quotation makes it a misquote.
- No `linear-gradient`, no `linear regression`, no `linearInterpolate`, and no
  dependency named `linear` anywhere in the tree.

## Decisions taken

- App directory → **`apps/ship/`**; served path becomes `/ship/`.
- localStorage keys → **renamed outright, no migration**. Every existing browser loses
  its stored secret key and identity.
- Manifest display name → **`'Estiva Ship'`**.
- `MANIFEST_D_TAG` → **`'estiva-ship'`**, decided after the first four commits. The
  manifest now addresses as `31990:88ac…d13:estiva-ship`. `src/manifest-address.ts` is
  normally generated; with no relay available it was hand-written to exactly what
  `publish-manifest.ts` emits, verified byte-identical.
- `scripts/seed-for-peek.ts` → **relative imports**, decided at the same time.
- The `from-Linear half of PEEK-17` comments → **`from-Ship`**; both meant the tracker
  side of the pairing.

## Outstanding

1. **Nothing is published at the new manifest address.** `npm run manifest` has to run
   against the live relay, or the app recommends a `kind:31990` that does not exist and
   consumers resolve nothing. The old `…:linear-lite` manifest still exists on any relay
   that already has it.
2. **Old localStorage identities are dropped.** Any secret key in a browser that matters
   must be exported before this ships.
3. **The UI has not been rendered in a browser.** `npm run smoke` cannot launch Chromium
   here — `libnspr4.so` is missing (`sudo apt install libnspr4 libnss3`). Coverage so far
   is typecheck, the 50 unit assertions, and a successful build.

## Left to do outside this repo

Git remote and GitHub repo name; the `/home/miky/linear-lite` checkout directory; DNS
and any deployed origin; deploy config referencing the `/linear-lite/` path (now
`/ship/`); `~/peek-app/docs/buzz-compat/LINEAR_LITE_SPEC.md` if the spec should be
renamed too; the `.manifest-key` identity if the brand should own a new one.
