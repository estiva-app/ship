# `interop/` — vendored from `estiva-app/peek`

**This directory is a copy. Do not edit it here.**

| | |
| --- | --- |
| source | `estiva-app/peek`, `interop/projection.ts` |
| vendored at | `1e91c24` (PR #85) |
| sha256 | `5b01ddd138099623ebc9bde9d9f406dae8f90c3f810a1348138f7394a1bca9c4` |
| why | PRO-7 — Ship is the projection layer's second consumer |

## Why a copy rather than a package

The runtime is not published yet, deliberately. [SHA-7][adr]'s lesson is that a
layer with one consumer that has never pushed back is not ready to publish, and
PRO-1's own note says the second consumer should exist *before* the package
does. Publishing it to get it here would be doing the thing that lesson forbids,
in order to test whether the lesson applies.

So it arrives the same way `estiva-agent` gets Ship's `src/` and `lib/nostr/`:
by copy, at an identical path, with `diff -r` as a check anybody can run.

```bash
diff -r interop ../peek-app/interop
```

`scripts/vendor.test.ts` is the automated half — it asserts the sha256 above, so
an edit made here fails CI rather than drifting quietly. Upstream drift is what
`diff -r` catches, and it needs both repositories checked out.

## Re-vendoring

Copy the file, update the commit and sha256 above, and run the tests. Both
belong in the same commit as the copy — a sha that no longer matches its file is
worse than no sha at all, because it fails for the wrong reason.

**If the test fails, do not regenerate the constant.** A failure means this copy
and upstream disagree, and updating the sha erases the finding rather than
fixing it. Confirm the change is one you meant to import first.

## What goes away

PRO-9 publishes `@estiva-app/interop`, and this directory is deleted the day it
does. Anything Ship needs that is *not* in the upstream file belongs in Ship's
own code, never in here — an edit here is invisible to Peek and will be
overwritten by the next re-vendor.

[adr]: https://github.com/estiva-app/estiva-docs/blob/main/decisions/0002-foundation-packages.md
