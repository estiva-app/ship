import { appChecks } from '@estiva-app/ui/gates'

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
 * **Where this file lives, and what its paths mean.** Ship's app is in `web/`,
 * and so is its install, so this file sits beside the app — `web/scripts/` —
 * because it imports the package. Everything it *names* is still read from the
 * repo's top folder, where `gates:status` runs: Ship's own source is
 * `web/src/…`, while the hook and the workflows have no prefix.
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
  const WEB = "web";
  const PROBE = "src/components/__gates_probe__.tsx";
  const GATES = "eslint.gates.config.js";
  const fiveSections = (mdx) => h.exists(mdx) && ["What it is", "When", "When not", "How", "What it owns"].every((s) => new RegExp(`^#+\\s*${s}\\s*$`, "m").test(h.read(mdx)));
  const probe = (code, expect, mentions, file = PROBE, config = GATES) => () => h.lint({ cwd: WEB, config, file, code, expect, mentions });
  const component = (body) => `export function Probe() {\n  return ${body}\n}\n`;
  const registry = () => (h.exists("registry.json") ? "registry.json" : "web/registry.json");

  // Ship's own: a ticket of Ship's, or a check that reads a file only Ship has.
  const own = [
    { ref: "UIG-9", checks: [
      { what: "a part re-exported from Ship's own file is followed: padding on EmptyState is an error", run: probe(`import { EmptyState } from '@/components/ui/EmptyState'\n${component('<EmptyState className="py-6" message="Nothing yet" />')}`, "error", "EmptyState takes no padding") },
      { what: "a component that hands its className on is followed", run: probe(`import { ProjectCard } from '@/components/ProjectCard'\n${component('<ProjectCard className="bg-bg-hover" />')}`, "error", "hands its `className` to `Card`") },
    ] },
    { ref: "UIG-18", title: "Usage rules — Ship's own components", owner: true, checks: [
      { what: "ForeignObject has a usage page with the five sections", run: () => fiveSections("web/src/components/ui/ForeignObject.mdx") ? h.PASS("ForeignObject.mdx has all five") : h.FAIL("web/src/components/ui/ForeignObject.mdx does not have all five yet") },
      { what: "every Ship component in the registry has a class", run: () => h.json(registry(), (d) => (d.entries ?? d.components ?? []).every((e) => e.repo !== "ship" || e.class || e.classification), "every ship entry has a class") },
    ] },
    { ref: "UIG-27", checks: [
      // The adoption deleted these; the checks keep them deleted.
      { what: "Ship's hand-made progress bar is gone", run: () => h.exists("web/src/components/ui/ProgressBar.tsx") ? h.FAIL("web/src/components/ui/ProgressBar.tsx is back: use the package's ProgressBar") : h.PASS("web/src/components/ui/ProgressBar.tsx is gone") },
      { what: "Ship's mentions are the package's InlineChip", run: () => h.contains("web/src/components/ui/Reference.tsx", /\bInlineChip\b/, "Reference.tsx draws InlineChip") },
      { what: "Ship's files are the package's AttachmentCard", run: () => h.contains("web/src/components/ui/Attachment.tsx", /\bAttachmentCard\b/, "Attachment.tsx draws AttachmentCard") },
    ] },
  ];

  // Ship's own checks join the package's row for the same ticket, or make a row of their own.
  const tickets = appChecks(h, {
    app: WEB,
    page: "src/pages/ProjectPage.tsx",
    chain: { ref: "UIG-4", owner: true },
    // Ship runs the token contract inside its one lint config; it has no config of its own for it.
    tokenConfigs: ["eslint.config.js"],
    headers: ["SectionHeader"],
  });
  for (const { ref, title, owner = false, checks } of own) {
    const row = tickets.find((t) => t.ref === ref);
    if (row) row.checks.push(...checks);
    else tickets.push({ ref, title, owner, checks });
  }

  return { repo: "ship", tickets };
}
