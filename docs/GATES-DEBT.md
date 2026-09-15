# GATES-DEBT.md — what cannot pass a gate yet

Ship's debt list for the UI Guardrails (estiva-ui `docs/GATES.md` §21).

A file that cannot pass a gate yet is written here, with the gate, the reason
and the date it was written. A debt list is a promise; a file a gate skips
without a line here is a silent ignore, and that is a lie.

| file | gate | reason | since |
|---|---|---|---|

**Nothing is owed.** 16 September 2026, UIG-4: the gate lint
(`estiva/no-raw-button`, `npm --prefix web run lint:rules`) finds 0 raw
`<button>` in `web/src`, stories included, tests out, and no file is excused.
