import { appChecks } from '@estiva-app/ui/gates'
import { pageProblem } from '@estiva-app/ui/registry'

/**
 * What gates:status checks in ship.
 *
 * The checks every app runs are the package's own piece, `appChecks` in
 * `@estiva-app/ui/gates` (UIG-32, estiva-ui docs/GATES.md §23). Ship's list is
 * that, plus the checks about Ship's own code — its wrappers, what its adoption
 * deleted — which no other app can run. `npm run gates:compare` in estiva-ui is
 * what decides which is which: every check here was either in the package's
 * list already, or reads a file only Ship has.
 *
 * **What its paths mean.** Ship is laid out as Peek is (PER-19): one package at
 * the repo's top folder, the app in `src/`. Everything this file names is read
 * from there, where `gates:status` runs.
 *
 * `owner: true` is a ticket ship owns. `owner: false` is ship's part of a
 * ticket another repo owns. The list of all tickets, and who owns each, is in
 * estiva-ui's scripts/gates-checks.mjs. Run gates:status there to see them all
 * together.
 *
 * A check for a ticket that is not built yet is a first guess at the evidence,
 * taken from the ticket's own text. The ticket that builds it confirms or
 * changes its checks, here and in estiva-ui docs/GATES.md §15, in the same
 * session.
 */
export default function define(h) {
  const PROBE = "src/components/__gates_probe__.tsx";
  const GATES = "eslint.gates.config.js";
  /*
    The page contract is the package's one copy (UIG-19): `estiva-ui check`
    holds every reusable part to it in CI's gate job, and `pageProblem` is the
    same rule for the two one-offs Katerina kept in scope. Ship pasted its own
    until then. Returns why a page fails, or null.
  */
  const usagePage = (mdx) => (h.exists(mdx) ? pageProblem(h.read(mdx)) : "no page");
  const probe = (code, expect, mentions, file = PROBE, config = GATES) => () => h.lint({ config, file, code, expect, mentions });
  const component = (body) => `export function Probe() {\n  return ${body}\n}\n`;

  // Ship's own: a ticket of Ship's, or a check that reads a file only Ship has.
  const own = [
    { ref: "UIG-9", checks: [
      { what: "a part re-exported from Ship's own file is followed: padding on EmptyState is an error", run: probe(`import { EmptyState } from '@/components/ui/EmptyState'\n${component('<EmptyState className="py-6" message="Nothing yet" />')}`, "error", "EmptyState takes no padding") },
      { what: "a component that hands its className on is followed", run: probe(`import { ProjectCard } from '@/components/ProjectCard'\n${component('<ProjectCard className="bg-bg-hover" />')}`, "error", "hands its `className` to `Card`") },
    ] },
    { ref: "UIG-18", title: "Usage rules — Ship's own components", owner: true, checks: [
      { what: "every reusable component has a usage page that keeps the contract", run: () => h.contract(".") },
      { what: "the two one-offs Katerina kept in scope have one too", run: () => {
        // DescriptionEditor gave way to LiveHeader, its successor on both pages (30 September); the page moved with it.
        const bad = [["LiveHeader", "src/components/editing/LiveHeader.mdx"], ["BlockAnchorNote", "src/components/ui/BlockAnchorNote.mdx"]].map(([n, f]) => [n, usagePage(f)]).filter(([, why]) => why);
        return bad.length ? h.FAIL(bad.map(([n, why]) => `${n}: ${why}`).join("; ")) : h.PASS("LiveHeader and BlockAnchorNote have pages");
      } },
      // A page is findable either because it carries its own stories, or because
      // it names the stories that already draw the part — Katerina, 21 September:
      // a story that repeats another is not worth writing.
      { what: "every usage page either has its own stories or says where it is seen", run: () => {
        const pages = h.listFiles(`src/components`, (n) => n.endsWith(".mdx"));
        if (!pages.length) return h.FAIL("no usage pages beside components");
        const bad = pages.filter((f) => { const t = h.read(f); return !/<Meta of=\{/.test(t) && !/\*\*Seen in\*\*/.test(t); });
        return bad.length ? h.FAIL(`no stories and no "Seen in": ${bad.join(", ")}`) : h.PASS(`${pages.length} pages, each with stories or a "Seen in"`);
      } },
      { what: "Storybook reads a page that sits beside its component", run: () => h.contains(`.storybook/main.ts`, /['"]\.\.\/src\/components\/\*\*\/\*\.mdx['"]/, "main.ts globs src/components/**/*.mdx") },
      { what: "the four parts that had no picture anywhere now have stories", run: () => {
        const missing = ["ui/ForeignObject", "ui/RichText", "ui/ConversationCount", "ui/BlockAnchorNote"].filter((p) => !h.exists(`src/components/${p}.stories.tsx`));
        return missing.length ? h.FAIL(`no story file: ${missing.join(", ")}`) : h.PASS("ForeignObject, RichText, ConversationCount and BlockAnchorNote each have a story");
      } },
      // Built in memory, as `estiva-ui check` builds it: the catalogue is never
      // committed, and a local registry.json read stale, or not at all on a
      // clean checkout (the audit before UIG-26, A5).
      { what: "every Ship component in the catalogue has a class", run: () => h.catalogue(".") },
    ] },
    { ref: "UIG-27", checks: [
      // The adoption deleted these; the checks keep them deleted.
      { what: "Ship's hand-made progress bar is gone", run: () => h.exists("src/components/ui/ProgressBar.tsx") ? h.FAIL("src/components/ui/ProgressBar.tsx is back: use the package's ProgressBar") : h.PASS("src/components/ui/ProgressBar.tsx is gone") },
      { what: "Ship's mentions are the package's InlineChip", run: () => h.contains("src/components/ui/Reference.tsx", /\bInlineChip\b/, "Reference.tsx draws InlineChip") },
      { what: "Ship's files are the package's AttachmentCard", run: () => h.contains("src/components/ui/Attachment.tsx", /\bAttachmentCard\b/, "Attachment.tsx draws AttachmentCard") },
    ] },
  ];

  // Ship's own checks join the package's row for the same ticket, or make a row of their own.
  const tickets = appChecks(h, {
    page: "src/pages/ProjectPage.tsx",
    chain: { ref: "UIG-4", owner: true },
    // Ship runs the token contract inside its one lint config; it has no config of its own for it.
    tokenConfigs: ["eslint.config.js"],
  });
  for (const { ref, title, owner = false, checks } of own) {
    const row = tickets.find((t) => t.ref === ref);
    if (row) row.checks.push(...checks);
    else tickets.push({ ref, title, owner, checks });
  }

  return { repo: "ship", tickets };
}
