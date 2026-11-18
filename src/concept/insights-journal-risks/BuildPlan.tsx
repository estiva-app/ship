/**
 * CONCEPT — a project's Issues, the Dashboard view (Miky, 17 Nov): sequencing is milestones.
 * - One list, as Linear groups issues by milestone: each milestone a filled row, its issues one line each in Ship's own
 *   list row, with the AI session and the PR as chips; the milestone being built first, the finished ones folded.
 * - Then Scope to decide: what came up while building, each with a recommendation to accept or change.
 * - Last, Out of scope: Later and Not doing as two tabs.
 * Real data: the project "Topics: level up the topic experience" as it stood on 9 Nov, its milestones, issues and
 * Later lines (raised by its /land and kickoff runs) and its Not in scope list. The two sessions are imagined.
 */
import { useState, type MouseEvent, type ReactNode } from "react";
import {
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconFlag3,
  IconGitMerge,
  IconGitPullRequest,
  IconGitPullRequestDraft,
  IconMessageQuestion,
  IconArrowRight,
  IconCornerDownRight,
  IconPlayerPlay,
  IconPlus,
  IconTerminal2,
  IconX,
} from "@tabler/icons-react";
import {
  Avatar,
  Button,
  Card,
  Chip,
  IconButton,
  Link,
  MetaText,
  Panel,
  Person,
  SectionHeader,
  Select,
  Tabs,
  WithTooltip,
} from "@estiva-app/ui";
import { cn } from "@/lib/cn";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { IssueRow, type IssueRowData } from "@/components/IssueRow";
import type { IssuesTableRow } from "@/components/IssuesTable";
import { ISSUE_STATUSES, hrefFor } from "@/fixtures/issues";
import { AcceptReject, NewDot } from "./ItemParts";

type IssueStatus = "todo" | "in_progress" | "done" | "cancelled";
type Session = {
  name: string;
  stage: string;
  last: string;
  when: string;
  waitsOnYou?: boolean;
};
type PrStage = "Draft" | "Open" | "Merged";
type PlanIssue = {
  ref: string;
  title: string;
  summary: string;
  status: IssueStatus;
  who: string;
  session?: Session;
  pr?: { name: string; stage: PrStage };
};
type Milestone = { n: number; title: string; issues: PlanIssue[] };

const MILESTONES: Milestone[] = [
  {
    n: 1,
    title:
      "The prototype shows the new sidebars, Explore, the menus and a topic’s arranged files",
    issues: [
      {
        ref: "TOPI-1",
        title: "Topics level-up, prototyped",
        summary:
          "Every changed Topics screen approved as a prototype; the build issues written from it.",
        status: "done",
        who: "Miky",
        pr: { name: "ship#598", stage: "Merged" },
      },
    ],
  },
  {
    n: 2,
    title: "Your topics come in the order things happen, in every app",
    issues: [
      {
        ref: "TOPI-10",
        title:
          "Peek lists your topics flat, newest activity first, with archived files in Overview",
        summary: "One flat list of every topic you are in, re-sorted live.",
        status: "done",
        who: "Miky",
        pr: { name: "peek#635", stage: "Merged" },
      },
      {
        ref: "TOPI-9",
        title:
          "Ship’s sidebar shows your five newest topics, folded, then Explore topics",
        summary: "The same order as Peek; each topic folds open to its files.",
        status: "in_progress",
        who: "Miky",
        session: {
          name: "Ship topics sidebar",
          stage: "Waiting on you",
          last: "Asked: does a topic fold open to its projects only, or to its projects and their issues?",
          when: "20 min ago",
          waitsOnYou: true,
        },
        pr: { name: "ship#604", stage: "Draft" },
      },
      {
        ref: "TOPI-4",
        title:
          "Leaf’s five topics follow the same order, and Explore topics opens Leaf’s page of every topic",
        summary: "Leaf’s sidebar reads the same order as Peek and Ship.",
        status: "in_progress",
        who: "Miky",
        session: {
          name: "Leaf topics order",
          stage: "In review",
          last: "The three reviewers are running on the PR",
          when: "4 min ago",
        },
        pr: { name: "leaf#52", stage: "Open" },
      },
    ],
  },
  {
    n: 3,
    title: "A topic’s files keep the order and look someone gave them",
    issues: [
      {
        ref: "TOPI-5",
        title: "A topic’s files keep one order and look for everyone",
        summary:
          "Drag a file into place in Peek and show it as a row or a card; Ship and Leaf list them in that order.",
        status: "todo",
        who: "Miky",
      },
    ],
  },
  {
    n: 4,
    title:
      "You find any topic from Explore, and Peek’s menu has only what you need",
    issues: [
      {
        ref: "TOPI-6",
        title: "Explore topics in Peek finds any topic, archived ones too",
        summary: "In place of Other topics and Archived.",
        status: "todo",
        who: "Miky",
      },
      {
        ref: "TOPI-7",
        title:
          "Peek’s topic menu keeps what you do from a list; Add to Open work gets a button and a shortcut",
        summary: "Rename, Move, Archive and Delete move to the topic’s page.",
        status: "todo",
        who: "Miky",
      },
    ],
  },
];
const NOW = 2;

const PR_ICON: Record<PrStage, ReactNode> = {
  Draft: <IconGitPullRequestDraft size={12} stroke={1.5} className="text-text-muted" />,
  Open: <IconGitPullRequest size={12} stroke={1.5} className="text-success-default" />,
  Merged: <IconGitMerge size={12} stroke={1.5} className="text-accent-primary" />,
};

const stay = (e: MouseEvent) => e.preventDefault();

/** An issue as Ship's own list row reads it; the Dashboard, the Table and the Board share it. */
const rowOf = (i: PlanIssue, n: number): IssueRowData => ({
  addr: `30851:topi:${i.ref}`,
  id: i.ref,
  ref: i.ref,
  title: i.title,
  summary: i.summary,
  status: i.status,
  assignee: { name: i.who },
  openedBy: { name: "Miky" },
  at: 1794916000 - 86400 * n,
});
const ORDER = MILESTONES.flatMap((m) => m.issues.map((i) => i.ref));

/**
 * The chips after an issue's title, as Linear's row has them (Miky, 17 Nov): its AI session, named, with its state as
 * the icon (an amber question when it waits on you, else the terminal; hover gives its last words), or Start session
 * where it has none; then its pull request, the icon saying Draft, Open or Merged. A done issue keeps only its PR.
 */
function IssueChips({ issue }: { issue: PlanIssue }) {
  const s = issue.session;
  return (
    <>
      {issue.status !== "done" &&
        (s ? (
          <WithTooltip label={`${s.waitsOnYou ? "Waiting on you" : "Working"}: ${s.last}`}>
            <span className="flex">
              <Chip
                href="#"
                onClick={stay}
                label={s.name}
                leadingIcon={
                  s.waitsOnYou ? (
                    <IconMessageQuestion size={12} stroke={1.5} className="text-warning-default" />
                  ) : (
                    <IconTerminal2 size={12} stroke={1.5} />
                  )
                }
                className="max-w-[200px]"
              />
            </span>
          </WithTooltip>
        ) : (
          <Chip href="#" onClick={stay} label="Start session" leadingIcon={<IconPlayerPlay size={12} stroke={1.5} />} />
        ))}
      {issue.pr && (
        <WithTooltip label={issue.pr.stage}>
          <span className="flex">
            <Chip href="#" onClick={stay} label={issue.pr.name} leadingIcon={PR_ICON[issue.pr.stage]} />
          </span>
        </WithTooltip>
      )}
    </>
  );
}

/**
 * A milestone in the one list, as Linear groups by milestone (Miky, 17 Nov: "better clarity and readability"): a filled
 * row with its number and title, Now on the one being built, how many are done, and + for a new issue in it; then its
 * issues, one line each, in Ship's own list row.
 */
function MilestoneGroup({ m, now = false }: { m: Milestone; now?: boolean }) {
  const [open, setOpen] = useState(true);
  const done = m.issues.filter((i) => i.status === "done").length;
  const finished = done === m.issues.length;
  return (
    <section className="flex flex-col gap-px" aria-label={`Milestone ${m.n}`}>
      <h3 className="flex h-9 items-center gap-2 rounded-md bg-bg-inset pr-1 pl-1">
        <IconButton tooltip={open ? "Hide issues" : "Show issues"} onClick={() => setOpen((o) => !o)}>
          {open ? <IconChevronDown size={16} stroke={1.5} /> : <IconChevronRight size={16} stroke={1.5} />}
        </IconButton>
        {finished ? (
          <IconCircleCheck size={16} stroke={1.5} className="shrink-0 text-success-default" />
        ) : (
          <IconFlag3 size={16} stroke={1.5} className="shrink-0 text-text-muted" />
        )}
        <span className="min-w-0 truncate text-body-2 font-medium">
          {m.n} · {m.title}
        </span>
        {now && <Chip type="brand" label="Now" />}
        <MetaText tone="muted">
          {done}/{m.issues.length}
        </MetaText>
        {!finished && (
          <span className="ml-auto flex">
            <IconButton tooltip="New issue in this milestone" onClick={() => undefined}>
              <IconPlus size={16} stroke={1.5} />
            </IconButton>
          </span>
        )}
      </h3>
      {open &&
        m.issues.map((i) => {
          // An issue accepted from Scope to decide is the newest: opened today.
          const row = rowOf(i, Math.max(0, ORDER.indexOf(i.ref)));
          return (
            <IssueRow key={i.ref} issue={row} statuses={ISSUE_STATUSES} href={hrefFor(row)} chips={<IssueChips issue={i} />} />
          );
        })}
    </section>
  );
}

/** Finished milestones at the foot of the list, folded into one line, as Linear's "4 more completed". */
function Completed({ milestones }: { milestones: Milestone[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span className="flex">
        <Button variant="muted" size="small" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide completed" : `${milestones.length} more completed`}
        </Button>
      </span>
      {open && milestones.map((m) => <MilestoneGroup key={m.n} m={m} />)}
    </>
  );
}


/** Where a line came up: the issue being worked on, and at which step; its PR and AI session, if it had them then. */
type Found = { ref: string; step: "review" | "kickoff" | "build"; pr?: string; session?: string };
/** A line raised while building: real ones from this project's /land and kickoff runs (9–10 Nov). */
type Line = {
  id: string;
  title: string;
  from: string;
  at: string;
  isNew?: boolean;
  /** Where Claude would put it, and why; `project` names the other project when `to` is "project". */
  rec?: { to: string; why: string; project?: string };
  found?: Found;
  /**
   * An issue someone filed into the project with no milestone (Miky, 18 Nov: Scope to decide holds both the rough
   * notes and the issues to sort out, one list). It keeps its ref when accepted; ✕ cancels it and tells its filer why.
   */
  filed?: { ref: string; by: string; as: "Bug" | "Improvement" };
  /** What was seen, in a few sentences: what a person does, what happens, why it matters. */
  detail?: string;
};
const TRIAGE: Line[] = [
  {
    id: "t1",
    title: "Join on Ship’s Explore topics says nothing when it works",
    from: "TOPI-9’s review",
    at: "Today",
    isNew: true,
    found: { ref: "TOPI-9", step: "review", pr: "ship#604", session: "Ship topics sidebar" },
    detail:
      "On Ship’s Explore topics, Join on a topic you are not in works, but the row does not change: Join stays and the Members count stays the same until you reload. It looks as if nothing happened, so people press it again.",
    rec: {
      to: "m2",
      why: "Joining is in this milestone’s Done when, and a silent success reads as broken.",
    },
  },
  {
    id: "t2",
    title: "A Members or Last active cell on Ship’s Explore that did not load stays blank",
    from: "TOPI-9’s review",
    at: "Today",
    isNew: true,
    found: { ref: "TOPI-9", step: "review", pr: "ship#604", session: "Ship topics sidebar" },
    detail:
      "When the read for one topic’s members or last activity fails, those cells stay empty. They fill in only after you switch to another tab and back. The rest of the page works.",
    rec: {
      to: "later",
      why: "Only when one read fails; the rest of the page works and nothing is lost.",
    },
  },
  {
    id: "t3",
    title: "After Join on Leaf’s Explore topics, its Members count leaves you out",
    from: "TOPI-4’s review",
    at: "Today",
    isNew: true,
    found: { ref: "TOPI-4", step: "review", pr: "leaf#52", session: "Leaf topics order" },
    detail:
      "Join a topic from Leaf’s Explore topics and its Members count stays one short, without you, until you open the page again.",
    rec: {
      to: "m2",
      why: "TOPI-4 is still in review: one line in its PR, before it merges.",
    },
  },
  {
    id: "t5",
    title: "Peek’s composer loses a draft when you switch topics before sending",
    from: "TOPI-10’s review",
    at: "Today",
    isNew: true,
    found: { ref: "TOPI-10", step: "review", pr: "peek#635" },
    detail:
      "Start a message in one topic, open another topic from the new list, and come back: the message you were writing is gone. It happens with the old list too, so this project did not cause it.",
    rec: {
      to: "project",
      project: "Peek: Feedback & Bugs",
      why: "A Peek bug outside this project’s Goal, and older than it; Peek’s bugs are fixed from Feedback & Bugs.",
    },
  },
  {
    id: "t4",
    title: "Peek’s Topics icon: back to Explore topics, or to your last topic?",
    from: "TOPI-10’s kickoff",
    at: "Yesterday",
    found: { ref: "TOPI-10", step: "kickoff" },
    detail:
      "In Peek’s rail, the Topics icon opens Explore topics every time. Once you are in a topic, it could instead take you back to the last topic you were in, as the other icons do.",
    rec: {
      to: "not",
      why: "Peek’s navigation is reworked in the next stage; deciding it now would be undone.",
    },
  },
  // Two issues filed into the project, imagined: a bug Katerina hit, and a small improvement she sent.
  {
    id: "t6",
    title: "A topic you left still shows in Ship’s sidebar",
    from: "Katerina’s bug",
    at: "2 days ago",
    isNew: true,
    filed: { ref: "TOPI-12", by: "Katerina", as: "Bug" },
    detail:
      "Katerina left the Release notes topic in Peek. In Ship it stayed under Topics in the sidebar, and opening it said she could not read it.",
    rec: {
      to: "m2",
      why: "Leaving a topic is the other half of joining one, which is in this milestone’s Done when.",
    },
  },
  {
    id: "t7",
    title: "Sort the sidebar’s topics A–Z",
    from: "Katerina’s improvement",
    at: "Yesterday",
    filed: { ref: "TOPI-13", by: "Katerina", as: "Improvement" },
    detail: "Ship lists topics in the order they were made. With more than a few, Katerina scans for one by name.",
    rec: {
      to: "later",
      why: "The order of topics is not in this project’s Goal; a small polish for after its Done when.",
    },
  },
];
const LATER: Line[] = [
  {
    id: "l1",
    title:
      "In Ship’s and Leaf’s sidebars, a topic whose files are all archived folds open to an empty list",
    from: "TOPI-1’s prototype",
    at: "8 Nov",
  },
  {
    id: "l2",
    title:
      "Ship reads its own read-state slot back once per publish, one small extra query",
    from: "TOPI-10’s review",
    at: "9 Nov",
  },
  {
    id: "l3",
    title:
      "When Peek’s Topics column fails to load it offers no Explore topics row, where Ship’s sidebar does",
    from: "TOPI-10’s review",
    at: "9 Nov",
  },
];
const NOT_DOING: Line[] = [
  {
    id: "n1",
    title:
      "Activity as a dot by the topic’s title, instead of the right-hand panel",
    from: "the Activity stage of the Initiative",
    at: "3 Nov",
  },
  {
    id: "n2",
    title:
      "Choosing what a file’s widget shows, such as a project showing only To do and In progress",
    from: "not this project",
    at: "3 Nov",
  },
  {
    id: "n3",
    title: "The order of topics inside a team’s section of Peek’s Teams screen",
    from: "Teams and following",
    at: "3 Nov",
  },
];
const PUT_IN = [
  ...MILESTONES.filter((m) => m.issues.some((i) => i.status !== "done")).map(
    (m) => ({
      value: `m${m.n}`,
      label: `${m.n}. ${m.title}${m.n === NOW ? " (now)" : ""}`,
    }),
  ),
  { value: "later", label: "Later" },
  { value: "project", label: "Another project…" },
  { value: "not", label: "Not doing" },
];

/** A recommendation as its chip and the panel say it: the other project by name, else the place. */
const recSaid = (rec: { to: string; project?: string }) => (rec.to === "project" && rec.project ? rec.project : said(rec.to));

const said = (v: string) =>
  v === "not"
    ? "Not doing"
    : v === "later"
      ? "Later"
      : v === "project"
        ? "Another project"
        : Number(v.slice(1)) === NOW
          ? "This milestone"
          : `Milestone ${v.slice(1)}`;

const STEP: Record<Found["step"], string> = { review: "reviewing", kickoff: "kicking off", build: "building" };
const issueOf = (ref: string) => MILESTONES.flatMap((m) => m.issues).find((i) => i.ref === ref);

/**
 * Where a line was found, first (Miky, 18 Nov): ↪ and the issue's ref, as a reply points back at what it answers; with
 * `title`, the issue's title after it. Hover gives the step, the issue and when.
 */
function FoundIn({ line, title = false }: { line: Line; title?: boolean }) {
  const f = line.found;
  // A filed issue: the face of who filed it and its own ref, where a note has ↪ and the issue it was found in. Hover
  // says what it is; on a box, the kind and who follow the ref.
  if (line.filed)
    return (
      <WithTooltip label={`${line.filed.as} filed by ${line.filed.by} · ${line.at}`}>
        <span className="relative flex min-w-0 items-center gap-1">
          <Avatar size={14} name={line.filed.by} />
          <span className="min-w-0 truncate">
            <MetaText tone="muted">
              {line.filed.ref}
              {title && ` · ${line.filed.as} filed by ${line.filed.by}`}
            </MetaText>
          </span>
        </span>
      </WithTooltip>
    );
  if (!f) return null;
  return (
    <WithTooltip label={`Found while ${STEP[f.step]} ${f.ref}: ${issueOf(f.ref)?.title ?? ""} · ${line.at}`}>
      <span className="relative flex min-w-0 items-center gap-1">
        <IconCornerDownRight size={14} stroke={1.5} className="shrink-0 text-text-muted" />
        <span className="min-w-0 truncate">
          <MetaText tone="muted">
            {f.ref}
            {title && ` · ${issueOf(f.ref)?.title ?? ""}`}
          </MetaText>
        </span>
      </span>
    </WithTooltip>
  );
}

/** Where Claude would put it, as a chip: → This milestone, → Later, → Not doing. */
const RecChip = ({ line }: { line: Line }) =>
  line.rec ? <Chip label={recSaid(line.rec)} leadingIcon={<IconArrowRight size={12} stroke={1.5} />} /> : null;

/**
 * Accept and ✕ on a line to decide (Miky, 18 Nov), the Insights' own pair: Accept puts it where Claude would, ✕ drops it
 * to Not doing. Another place is in the side panel.
 */
const Answer = ({ line, onPlace }: { line: Line; onPlace: (to: string) => void }) => (
  <AcceptReject label="Accept" onAnswer={(yes) => onPlace(yes ? (line.rec?.to ?? "later") : "not")} />
);

/**
 * One line to decide, its columns as an issue row's: first the issue it was found in (↪ TOPI-9, at the ref's width),
 * then its title, where Claude would put it, and Accept / ✕. A click opens it beside the list.
 */
function ScopeRow({ line, selected, onOpen, onPlace }: { line: Line; selected: boolean; onOpen: () => void; onPlace: (to: string) => void }) {
  return (
    <div className={cn("relative flex h-9 min-w-0 items-center gap-3 rounded-md px-3 transition-colors hover:bg-bg-hover", selected && "bg-bg-selected")}>
      <span className="flex w-24 shrink-0">
        <FoundIn line={line} />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <Link href="#" variant="plain" truncate cover onClick={(e) => (e.preventDefault(), onOpen())}>
          {line.title}
        </Link>
        <NewDot on={line.isNew} />
      </span>
      <RecChip line={line} />
      <span className="relative flex">
        <Answer line={line} onPlace={onPlace} />
      </span>
    </div>
  );
}

/**
 * Scope to decide on the List (Miky, 18 Nov: "concise and clear"): one line each, first the issue it was found in, then
 * its title, where Claude would put it, and Accept / ✕. A click opens it beside the list.
 */
function ScopeToDecide({ lines, openId, onOpen, onPlace }: { lines: Line[]; openId?: string; onOpen: (id: string) => void; onPlace: (id: string, to: string) => void }) {
  if (!lines.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Scope to decide">
      <SectionHeader title="Scope to decide" count={lines.length} />
      <div className="flex flex-col gap-px">
        {lines.map((l) => (
          <ScopeRow key={l.id} line={l} selected={l.id === openId} onOpen={() => onOpen(l.id)} onPlace={(to) => onPlace(l.id, to)} />
        ))}
      </div>
    </section>
  );
}

/** The lines still to decide, given where each has been placed. */
export const scopeLeft = (placed: Record<string, string>) => TRIAGE.filter((l) => !placed[l.id]);

/**
 * Scope to decide on the Board (Miky, 18 Nov), under the columns, each line a box shaped as an Open question's: the
 * issue it was found in as its header (↪ TOPI-9 · its title), the line itself, then a footer with where Claude would put
 * it and Accept / ✕. A click opens it beside the board.
 */
export function ScopeBoxes({ placed, openId, onOpen, onPlace }: { placed: Record<string, string>; openId?: string; onOpen: (id: string) => void; onPlace: (id: string, to: string) => void }) {
  const lines = scopeLeft(placed);
  if (!lines.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Scope to decide">
      <SectionHeader title="Scope to decide" count={lines.length} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        {lines.map((l) => (
          <Card key={l.id} fill="surface" hover="hairline" selected={l.id === openId} className="relative flex flex-col gap-3 p-4">
            <FoundIn line={l} title />
            <span className="font-medium">
              <Link href="#" variant="quiet" cover onClick={(e) => (e.preventDefault(), onOpen(l.id))}>
                {l.title}
              </Link>
              <NewDot on={l.isNew} />
            </span>
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
              <RecChip line={l} />
              <span className="relative flex">
                <Answer line={l} onPlace={(to) => onPlace(l.id, to)} />
              </span>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

/**
 * A line to decide, opened beside the list (Miky, 18 Nov: "clickable so in the right sidebar you can see details"):
 * what was seen, where it was found (the issue, its PR and AI session, when), then the recommendation and why, with
 * Accept, or another place.
 */
export function ScopePanel({ id, onPlace, onClose }: { id: string; onPlace: (to: string) => void; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const l = TRIAGE.find((t) => t.id === id);
  if (!l) return null;
  const f = l.found;
  const issue = f && issueOf(f.ref);
  return (
    <div className="flex w-[384px] min-h-0 shrink-0 flex-col border-l border-border-default">
      <Panel
        title={<MetaText tone="muted">Scope to decide</MetaText>}
        actions={
          <IconButton variant="muted" tooltip="Close" aria-label="Close" onClick={onClose}>
            <IconX size={16} stroke={1.5} />
          </IconButton>
        }
      >
        <ScrollArea className="min-h-0 flex-1" contentClassName="flex flex-col gap-5 px-4 pb-4">
          <span className="text-h3 text-text-primary">{l.title}</span>
          {l.detail && <span className="text-body-2 text-text-primary">{l.detail}</span>}
          {f && (
            <section className="flex flex-col gap-2" aria-label="Found while">
              <MetaText tone="muted">
                Found while {STEP[f.step]} · {l.at}
              </MetaText>
              <span className="flex min-w-0 items-center gap-2 text-body-2">
                <MetaText tone="muted">{f.ref}</MetaText>
                <Link href="#" variant="quiet" truncate onClick={(e) => e.preventDefault()}>
                  {issue?.title}
                </Link>
              </span>
              {(f.pr || f.session) && (
                <span className="flex flex-wrap items-center gap-1.5">
                  {f.session && <Chip href="#" onClick={stay} label={f.session} leadingIcon={<IconTerminal2 size={12} stroke={1.5} />} />}
                  {f.pr && <Chip href="#" onClick={stay} label={f.pr} leadingIcon={<IconGitPullRequest size={12} stroke={1.5} />} />}
                </span>
              )}
            </section>
          )}
          {l.filed && (
            <section className="flex flex-col gap-2" aria-label="Filed by">
              <MetaText tone="muted">
                {l.filed.as} filed · {l.at}
              </MetaText>
              <span className="flex min-w-0 items-center gap-2 text-body-2">
                <Person size={16} name={l.filed.by} />
                <MetaText tone="muted">{l.filed.ref}</MetaText>
              </span>
            </section>
          )}
          {l.rec && (
            <Card fill="surface" className="flex flex-col gap-3 p-3">
              <span className="flex items-center gap-1.5 text-body-2 font-medium text-text-primary">
                <IconArrowRight size={16} stroke={1.5} />
                {recSaid(l.rec)}
              </span>
              <span className="text-body-2 text-text-secondary">{l.rec.why}</span>
              {editing ? (
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <Select size="small" ariaLabel="Put in" placeholder="Put in…" value="" onChange={(v) => onPlace(v)} options={PUT_IN} />
                  </span>
                  <Button variant="muted" size="small" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <AcceptReject label="Accept" onAnswer={(yes) => onPlace(yes ? (l.rec?.to ?? "later") : "not")} />
                  <Button variant="outlined" size="small" onClick={() => setEditing(true)}>
                    Put elsewhere
                  </Button>
                </span>
              )}
              {/* ✕ on someone's issue cancels it, so it says so before you press it. */}
              {l.filed && (
                <MetaText tone="muted">
                  ✕ cancels {l.filed.by}’s issue and tells {l.filed.by} why.
                </MetaText>
              )}
            </Card>
          )}
        </ScrollArea>
      </Panel>
    </div>
  );
}

/** Later or Not doing: lines, like a log, each with where it came from. */
function Lines({
  label,
  lines,
  muted,
}: {
  label: string;
  lines: Line[];
  muted?: boolean;
}) {
  return (
    <section className="flex flex-col gap-1" aria-label={label}>
      <Card fill="none" clip>
        <ul aria-label={label}>
          {lines.map((l) => (
            <li
              key={l.id}
              className="flex flex-col border-b border-border-subtle px-4 py-2 last:border-b-0"
            >
              <span
                className={cn(
                  "text-body-2",
                  muted ? "text-text-secondary" : "text-text-primary",
                )}
              >
                {l.title}
              </span>
              <span className="min-w-0 truncate">
                <MetaText tone="muted">
                  {muted ? "Belongs to" : "From"} {l.from} · {l.at}
                </MetaText>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/**
 * The List view (Miky, 17–18 Nov, after Linear's issues by milestone; it replaced both the Dashboard and the Table):
 * one list, every milestone a filled row over its issues, one line each; the one being built first and marked Now,
 * the finished ones folded at the foot. Under it, the scope still to decide, then what is out of scope. Where each
 * line to decide was placed lives on the page, since the line opens beside the list.
 */
export function BuildPlan({ placed, openId, onOpen, onPlace }: { placed: Record<string, string>; openId?: string; onOpen: (id: string) => void; onPlace: (id: string, to: string) => void }) {
  const [outTab, setOutTab] = useState<"later" | "not">("later");
  const into = (to: string) => TRIAGE.filter((l) => placed[l.id] === to);
  // A suggestion accepted into a milestone becomes its next issue, numbered in the order they were accepted.
  const accepted = Object.keys(placed).filter((id) => placed[id].startsWith("m"));
  // A filed issue keeps its own ref; a note gets the next free one.
  const asIssue = (l: Line): PlanIssue => ({
    ref: l.filed?.ref ?? `TOPI-${14 + accepted.filter((id) => !TRIAGE.find((t) => t.id === id)?.filed).indexOf(l.id)}`,
    title: l.title,
    summary: l.filed ? `${l.filed.as} filed by ${l.filed.by}` : `From ${l.from}`,
    status: "todo",
    who: "Miky",
  });
  const milestones = MILESTONES.map((m) => ({
    ...m,
    issues: [...m.issues, ...into(`m${m.n}`).map(asIssue)],
  }));
  const finished = milestones.filter((m) => m.issues.every((i) => i.status === "done"));
  const open = milestones.filter((m) => !finished.includes(m));
  const current = open.find((m) => m.n === NOW) ?? open[0];
  const ordered = current ? [current, ...open.filter((m) => m !== current)] : open;
  const left = scopeLeft(placed);
  const later = [...into("later"), ...LATER];
  const notDoing = [...into("not"), ...NOT_DOING];
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3" aria-label="Milestones">
        {ordered.map((m) => (
          <MilestoneGroup key={m.n} m={m} now={m === current} />
        ))}
        {finished.length > 0 && <Completed milestones={finished} />}
      </section>
      <ScopeToDecide lines={left} openId={openId} onOpen={onOpen} onPlace={onPlace} />
      {/* Out of scope (Miky, 17 Nov): the scoping decisions, Later and Not doing as tabs over one list. */}
      <section className="flex flex-col gap-2" aria-label="Out of scope">
        <SectionHeader title="Out of scope" />
        <div className="flex min-h-8 items-center px-1">
          <Tabs
            size="small"
            tabs={[
              { id: "later", label: "Later", count: later.length },
              { id: "not", label: "Not doing", count: notDoing.length },
            ]}
            active={outTab}
            onChange={setOutTab}
          />
        </div>
        {outTab === "later" ? <Lines label="Later" lines={later} /> : <Lines label="Not doing" lines={notDoing} muted />}
      </section>
    </div>
  );
}

/** The same issues for Ship's own Table and Board: one plain list, no milestones. */
export function planRows(): IssuesTableRow[] {
  return MILESTONES.flatMap((m) => m.issues).map((i, n) => ({ ...rowOf(i, n), openedBy: { name: "Miky" } }));
}
