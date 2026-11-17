/**
 * CONCEPT — a project's Issues as the plan of its build (Miky, 17 Nov): sequencing is milestones.
 * - Triage first, as boxes in a grid, so what is new and unplaced never looks like the settled plan: each one goes into
 *   a milestone (needed for quality), to Later or another project, or to Not doing.
 * - Then one table per milestone, two lines a row; the milestone being built now is raised a little and tells more.
 *   A Claude Code session shows in its issue's row, one click away; an issue with none has Start session.
 * - Last, Later and Not doing, two tabs of one box.
 * Real data: the project "Topics: level up the topic experience" as it stood on 9 Nov, its milestones, issues and
 * Later lines (raised by its /land and kickoff runs) and its Not in scope list. The two sessions are imagined.
 */
import { useState, type ReactNode } from "react";
import {
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconGitMerge,
  IconGitPullRequest,
  IconGitPullRequestDraft,
  IconMessageQuestion,
  IconPlus,
  IconSparkles,
  IconTerminal2,
} from "@tabler/icons-react";
import {
  Button,
  Card,
  Divider,
  IconButton,
  Link,
  MetaText,
  SectionHeader,
  SectionLabel,
  Select,
  WithTooltip,
} from "@estiva-app/ui";
import { cn } from "@/lib/cn";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { StatusLabel } from "@/components/ui/StatusLabel";
import { NewDot } from "./ItemParts";

type IssueStatus = "todo" | "in_progress" | "done" | "cancelled";
const STATUS: Record<IssueStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};
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

// Issues' table look, as IssuesTable keeps it (ShipLists copies it for Risks the same way).
// @estiva-escape(no-copied-look): the concept copies IssuesTable's header cell so the tables match; the build shares one table part
const TH =
  "h-9 px-3 text-left text-menu font-medium uppercase tracking-widest text-text-secondary";

const PR_ICON: Record<PrStage, ReactNode> = {
  Draft: (
    <IconGitPullRequestDraft
      size={14}
      stroke={1.5}
      className="shrink-0 text-text-muted"
    />
  ),
  Open: (
    <IconGitPullRequest
      size={14}
      stroke={1.5}
      className="shrink-0 text-success-default"
    />
  ),
  Merged: (
    <IconGitMerge
      size={14}
      stroke={1.5}
      className="shrink-0 text-accent-primary"
    />
  ),
};

/**
 * The AI Session column (Miky, 17 Nov, named so the same day: "AI should have its own column so it's easy to start"): the issue's session and
 * what it is doing, or Start where there is none. A done issue's cell is empty.
 */
function ClaudeCell({ issue }: { issue: PlanIssue }) {
  if (issue.status === "done") return null;
  const s = issue.session;
  if (!s)
    return (
      <span className="relative flex">
        <Button variant="outlined" size="small" onClick={() => undefined}>
          Start
        </Button>
      </span>
    );
  return (
    // The session's own name, then its state as an icon with no label (Miky, 17 Nov): an amber question when it waits on
    // you, else the terminal; hover names it.
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="relative flex min-w-0">
        <Link
          href="#"
          variant="quiet"
          truncate
          onClick={(e) => e.preventDefault()}
        >
          {s.name}
        </Link>
      </span>
      <WithTooltip label={s.waitsOnYou ? "Waiting on you" : "Working"}>
        <span
          role="img"
          aria-label={s.waitsOnYou ? "Waiting on you" : "Working"}
          className="flex shrink-0"
        >
          {s.waitsOnYou ? (
            <IconMessageQuestion
              size={16}
              stroke={1.5}
              className="text-warning-default"
            />
          ) : (
            <IconTerminal2 size={16} stroke={1.5} className="text-text-muted" />
          )}
        </span>
      </WithTooltip>
    </span>
  );
}

/** One issue, two lines: the title, and under it what its session did last, or its summary. */
function PlanRow({ issue, now }: { issue: PlanIssue; now: boolean }) {
  const s = issue.session;
  return (
    <tr
      className={cn(
        "group relative border-b border-border-subtle last:border-b-0 hover:bg-bg-hover",
        issue.status === "done" && "text-text-muted",
      )}
    >
      <td className="px-3 align-top text-body-2 font-mono whitespace-nowrap text-text-muted">
        <span className={cn("block", now ? "py-3" : "py-2")}>{issue.ref}</span>
      </td>
      <td className={cn("px-3 align-top text-body-2", now ? "py-3" : "py-2")}>
        <span className="flex font-medium">
          <Link
            href="#"
            variant="quiet"
            truncate
            cover
            onClick={(e) => e.preventDefault()}
          >
            {issue.title}
          </Link>
        </span>
        {s ? (
          // The milestone being built now gives a session's last words in full: a question asked of you reads whole.
          <span className={cn("block text-text-secondary", !now && "truncate")}>
            {s.last} · {s.when}
          </span>
        ) : (
          <span className="block truncate text-text-secondary">
            {issue.summary}
          </span>
        )}
      </td>
      <td className="px-3 align-top text-body-2">
        <span className={cn("block", now ? "py-3" : "py-2")}>
          <StatusLabel value={issue.status} label={STATUS[issue.status]} />
        </span>
      </td>
      <td className="px-3 align-top text-body-2">
        {/* Its pull request in a column of its own (Miky, 17 Nov): the icon alone says Draft, Open or Merged; hover names it. */}
        {issue.pr && (
          <span
            className={cn(
              "relative flex items-center gap-1 whitespace-nowrap",
              now ? "py-3" : "py-2",
            )}
          >
            <WithTooltip label={issue.pr.stage}>
              <span role="img" aria-label={issue.pr.stage} className="flex">
                {PR_ICON[issue.pr.stage]}
              </span>
            </WithTooltip>
            <Link href="#" variant="quiet" onClick={(e) => e.preventDefault()}>
              {issue.pr.name}
            </Link>
          </span>
        )}
      </td>
      <td className="px-3 align-top text-body-2">
        <span className={cn("block", now ? "py-3" : "py-2")}>
          <ClaudeCell issue={issue} />
        </span>
      </td>
    </tr>
  );
}

/** A milestone's issues in the one table every milestone shares; the one being built now raised a little, with a header row. */
function IssueTable({ m, now }: { m: Milestone; now: boolean }) {
  return (
    <Card
      clip
      fill={now ? "surface" : "none"}
      attention={now ? "accent" : undefined}
    >
      <ScrollArea orientation="horizontal">
        <table
          className="w-full min-w-[800px] table-fixed border-collapse"
          aria-label={`Milestone ${m.n} issues`}
        >
          {now ? (
            <thead>
              <tr className="border-b border-border-default">
                <th className={cn(TH, "w-24")}>Ref</th>
                <th className={TH}>Title</th>
                <th className={cn(TH, "w-32")}>Status</th>
                <th className={cn(TH, "w-28")}>PR</th>
                <th className={cn(TH, "w-52")}>AI Session</th>
              </tr>
            </thead>
          ) : (
            // The quieter tables keep the same columns without a header, so every milestone lines up under Now's.
            <colgroup>
              <col className="w-24" />
              <col />
              <col className="w-32" />
              <col className="w-28" />
              <col className="w-52" />
            </colgroup>
          )}
          <tbody>
            {m.issues.map((i) => (
              <PlanRow key={i.ref} issue={i} now={now} />
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </Card>
  );
}

/** One step below a section's header: the kit's secondary label, which labels the rows under it (a milestone, Suggested, Later). */
function SubHead({
  label,
  trailing,
  after,
}: {
  label: string;
  trailing?: ReactNode;
  after?: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center gap-2 px-2">
      <SectionLabel tone="secondary" truncate>
        {label}
      </SectionLabel>
      {after}
      {trailing && (
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {trailing}
        </span>
      )}
    </div>
  );
}

const doneOf = (m: Milestone) =>
  `${m.issues.filter((i) => i.status === "done").length} of ${m.issues.length} done`;

/** A milestone still to build, under Next: its label, then its issues. */
function NextMilestone({ m }: { m: Milestone }) {
  return (
    <section className="flex flex-col gap-1" aria-label={`Milestone ${m.n}`}>
      <SubHead
        label={`${m.n}. ${m.title}`}
        trailing={<MetaText tone="muted">{doneOf(m)}</MetaText>}
      />
      <IssueTable m={m} now={false} />
    </section>
  );
}

/** A finished milestone, under Done: one line, its check after the title (Miky, 17 Nov), its issues behind the chevron. */
function DoneMilestone({ m }: { m: Milestone }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-1" aria-label={`Milestone ${m.n}`}>
      <SubHead
        label={`${m.n}. ${m.title}`}
        after={
          <WithTooltip label="Done">
            <span role="img" aria-label="Done" className="flex shrink-0">
              <IconCircleCheck
                size={16}
                stroke={1.5}
                className="text-success-default"
              />
            </span>
          </WithTooltip>
        }
        trailing={
          <IconButton
            tooltip={open ? "Hide issues" : "Show issues"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? (
              <IconChevronDown size={16} stroke={1.5} />
            ) : (
              <IconChevronRight size={16} stroke={1.5} />
            )}
          </IconButton>
        }
      />
      {open && <IssueTable m={m} now={false} />}
    </section>
  );
}

/** A line raised while building: real ones from this project's /land and kickoff runs (9–10 Nov). */
type Line = {
  id: string;
  title: string;
  from: string;
  at: string;
  isNew?: boolean;
  rec?: { to: string; why: string };
};
const TRIAGE: Line[] = [
  {
    id: "t1",
    title:
      "Join on Ship’s Explore topics says nothing when it works: the row loses Join and gains a member",
    from: "TOPI-9’s review",
    at: "Today",
    isNew: true,
    rec: {
      to: "m2",
      why: "Joining is in this milestone’s Done when, and a silent success reads as broken.",
    },
  },
  {
    id: "t2",
    title:
      "A Members or Last active column on Ship’s Explore that did not load stays blank until you switch tabs",
    from: "TOPI-9’s review",
    at: "Today",
    isNew: true,
    rec: {
      to: "later",
      why: "Only when one read fails; the rest of the page works and nothing is lost.",
    },
  },
  {
    id: "t3",
    title:
      "After Join on Leaf’s Explore topics, its Members count leaves you out until the next open",
    from: "TOPI-4’s review",
    at: "Today",
    isNew: true,
    rec: {
      to: "m2",
      why: "TOPI-4 is still in review: one line in its PR, before it merges.",
    },
  },
  {
    id: "t4",
    title: "Peek’s Topics icon: back to Explore topics, or to your last topic?",
    from: "TOPI-10’s kickoff",
    at: "Yesterday",
    rec: {
      to: "not",
      why: "Peek’s navigation is reworked in the next stage; deciding it now would be undone.",
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

/**
 * What came up while building, under Now and apart from its issues (Miky, 17 Nov: one table for both "looks messy"):
 * a list of its own, each line with Claude's recommendation and why. Accept puts it there (into this milestone, it
 * becomes an issue row in the table above); Edit picks another place.
 */
function Suggested({
  lines,
  onPlace,
}: {
  lines: Line[];
  onPlace: (id: string, to: string) => void;
}) {
  const [editing, setEditing] = useState<string>();
  if (!lines.length) return null;
  const place = (id: string, to: string) => (
    onPlace(id, to),
    setEditing(undefined)
  );
  return (
    <section className="flex flex-col gap-1" aria-label="Suggested">
      <SubHead
        label="Suggested"
        after={<MetaText tone="muted">{lines.length}</MetaText>}
      />
      <Card fill="none" clip>
        <ul aria-label="Suggested">
          {lines.map((l) => (
            <li
              key={l.id}
              className="flex items-start gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0"
            >
              <IconSparkles
                size={16}
                stroke={1.5}
                className="mt-0.5 shrink-0 text-accent-primary"
              />
              <span className="flex min-w-0 flex-1 flex-col text-body-2">
                <span className="font-medium text-text-primary">
                  {l.title}
                  <NewDot on={l.isNew} />
                </span>
                {l.rec && (
                  <span className="text-text-secondary">
                    <span className="text-text-primary">{said(l.rec.to)}</span>:{" "}
                    {l.rec.why}
                  </span>
                )}
              </span>
              {editing === l.id ? (
                <span className="flex shrink-0 items-center gap-2">
                  <span className="w-56">
                    <Select
                      size="small"
                      ariaLabel="Put in"
                      placeholder="Put in…"
                      value=""
                      onChange={(v) => place(l.id, v)}
                      options={PUT_IN}
                    />
                  </span>
                  <Button
                    variant="muted"
                    size="small"
                    onClick={() => setEditing(undefined)}
                  >
                    Cancel
                  </Button>
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => place(l.id, l.rec?.to ?? "later")}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setEditing(l.id)}
                  >
                    Edit
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </section>
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
      <SubHead
        label={label}
        after={<MetaText tone="muted">{lines.length}</MetaText>}
      />
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
 * The Issues tab in four sections (Miky, 17 Nov): Now (the milestone being built, then what came up while building it),
 * Next (the milestones after it), Done, and Later / Not doing (the scoping decisions). Each section opens with the
 * kit's section header; what sits in it, one step down, with the secondary label.
 */
export function BuildPlan() {
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const into = (to: string) => TRIAGE.filter((l) => placed[l.id] === to);
  // A suggestion accepted into a milestone becomes its next issue, numbered in the order they were accepted.
  const accepted = Object.keys(placed).filter((id) =>
    placed[id].startsWith("m"),
  );
  const asIssue = (l: Line): PlanIssue => ({
    ref: `TOPI-${11 + accepted.indexOf(l.id)}`,
    title: l.title,
    summary: `From ${l.from}`,
    status: "todo",
    who: "Miky",
  });
  const milestones = MILESTONES.map((m) => ({
    ...m,
    issues: [...m.issues, ...into(`m${m.n}`).map(asIssue)],
  }));
  const finished = milestones.filter((m) =>
    m.issues.every((i) => i.status === "done"),
  );
  const open = milestones.filter((m) => !finished.includes(m));
  const current = open.find((m) => m.n === NOW) ?? open[0];
  const next = open.filter((m) => m !== current);
  const left = TRIAGE.filter((l) => !placed[l.id]);
  const later = [...into("later"), ...LATER];
  const notDoing = [...into("not"), ...NOT_DOING];
  return (
    // A line between the four sections, so each reads as its own block (Miky, 17 Nov: "4 clear sections").
    <div className="flex flex-col gap-6">
      {current && (
        <section className="flex flex-col gap-2" aria-label="Now">
          <SectionHeader
            title="Now"
            trailing={<MetaText tone="muted">{doneOf(current)}</MetaText>}
            actions={[
              {
                icon: <IconPlus size={16} stroke={1.5} />,
                tooltip: "New issue",
                onClick: () => undefined,
              },
            ]}
          />
          <section
            className="flex flex-col gap-1"
            aria-label={`Milestone ${current.n}`}
          >
            <SubHead label={`${current.n}. ${current.title}`} />
            <IssueTable m={current} now />
          </section>
          <Suggested
            lines={left}
            onPlace={(id, to) => setPlaced((p) => ({ ...p, [id]: to }))}
          />
        </section>
      )}
      {next.length > 0 && (
        <>
          <Divider />
          <section className="flex flex-col gap-2" aria-label="Next">
            <SectionHeader title="Next" count={next.length} />
            <div className="flex flex-col gap-4">
              {next.map((m) => (
                <NextMilestone key={m.n} m={m} />
              ))}
            </div>
          </section>
        </>
      )}
      {finished.length > 0 && (
        <>
          <Divider />
          <section className="flex flex-col gap-2" aria-label="Done">
            <SectionHeader title="Done" count={finished.length} />
            {finished.map((m) => (
              <DoneMilestone key={m.n} m={m} />
            ))}
          </section>
        </>
      )}
      <Divider />
      <section className="flex flex-col gap-2" aria-label="Later / Not doing">
        <SectionHeader title="Later / Not doing" />
        <div className="flex flex-col gap-4">
          <Lines label="Later" lines={later} />
          <Lines label="Not doing" lines={notDoing} muted />
        </div>
      </section>
    </div>
  );
}
