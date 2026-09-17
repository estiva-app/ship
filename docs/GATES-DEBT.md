# GATES-DEBT.md — what cannot pass a gate yet

Ship's debt list for the UI Guardrails (estiva-ui `docs/GATES.md` §21).

A file that cannot pass a gate yet is written here, with the gate, the reason
and the date it was written. A debt list is a promise; a file a gate skips
without a line here is a silent ignore, and that is a lie.

| file | gate | reason | since |
|---|---|---|---|

**Nothing is owed.** 17 September 2026, UIG-9: the third rule
(`estiva/no-restyled-part`) found 13 looks passed into package parts on main
`25a38cc`. 11 are fixed: the words' look moved onto a box of Ship's own
(`IssueRail`, `IssuesTable`'s title and frame, `ui/ForeignObject`'s card that
could not be read), `EditableText` takes its title size from where it sits
(`ProjectHeader`, `views/IssueView`), and, from Katerina's photos, the link
fields are plain like Peek's (`NewProjectDialog`, `PairFolderDialog`) and the
loading block has a bar's corners (`ConversationThread`, `Description`). 2 are
escaped with their reason: `IssueRow`'s whole-row link and the project chip
lifted over it — no part makes a row that is a link yet.

Earlier, 16 September 2026, UIG-8: the second rule
(`estiva/no-rebuilt-behaviour`), now over `.ts` as well as `.tsx`, found 4 on
main `27113cd`: two error lines written by hand (`Composer`,
`ui/DescriptionEditing`), now the package's `FieldLine`; a code block that
scrolled with the browser's scrollbar (`ui/prose.ts`), which now wraps, as
Peek's does; and the description's reading surface, a Tab stop on a `<div>`
(`ui/DescriptionEditor`), kept with its reason — it holds headings and lists,
which a button cannot. 3 fixed, 1 escaped. An escape is not a debt: it is
counted in `web/.gates-count.json`, with its reason on the line above it.

Earlier, 16 September 2026, UIG-7: the gate lint
(`estiva/no-raw-element`, `npm --prefix web run lint:rules`) finds 0 raw
interactive elements in `web/src`, stories included, tests out, and no file
is excused. It found 6 on main `15d3c04` — four `<form>` and two file
`<input>` — and all 6 now use the package's `Form` and `FilePicker`; none is
escaped.

Earlier, 16 September 2026, UIG-4: the rule was `estiva/no-raw-button`, and it
found 0 raw `<button>`.
