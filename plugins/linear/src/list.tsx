import { defineKind, type PluginContext, z } from "@donut/sdk";
import { Dot, Empty, IconButton, Input, Label, List, Row, Select, Spinner, Stack, Tabs, Text } from "@donut/ui";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { useMineScope, useQuery } from "./hooks";
import { getProject, myIssues, searchIssues, teamIssues } from "./linear";
import type { IssueRow, ProjectDetail } from "./queries";
import { groupByState, type Workspace } from "./resolve";
import { Failure, IssueItem } from "./view";
import { loadWorkspace } from "./workspace";

const filters = ["mine", "team", "search", "project"] as const;
type Filter = (typeof filters)[number];

const props = z.object({
  filter: z.enum(filters).describe("mine: my open issues; team: a team's open issues; search: text search; project: one project's issues"),
  team: z.string().optional().describe("Team key or name (team mode, optional in search)"),
  project: z.string().optional().describe("Project name or id (project mode, optional in search and mine)"),
  query: z.string().optional().describe("Search text (search mode)"),
  scope: z.enum(["open", "cycle"]).optional().describe("mine mode: all open issues or only the active cycle (default: the linear.mine_scope setting)"),
});
type Props = z.infer<typeof props>;

const filterLabels: Record<Filter, string> = { mine: "Mine", team: "Team", search: "Search", project: "Project" };

interface Loaded {
  issues: IssueRow[];
  project?: ProjectDetail;
}

function missing(p: Props): string | null {
  if (p.filter === "team" && !p.team) return "Pick a team";
  if (p.filter === "search" && !p.query?.trim()) return "Type something to search";
  if (p.filter === "project" && !p.project) return "Pick a project";
  return null;
}

async function load(ctx: PluginContext, p: Props, scope: "open" | "cycle"): Promise<Loaded> {
  switch (p.filter) {
    case "mine":
      return { issues: await myIssues(ctx, scope, p.project) };
    case "team":
      return { issues: await teamIssues(ctx, p.team ?? "") };
    case "search":
      return { issues: await searchIssues(ctx, p.query ?? "", { team: p.team, project: p.project }, 50) };
    case "project": {
      const project = await getProject(ctx, p.project ?? "");
      return { issues: project.issues.nodes, project };
    }
  }
}

function useWorkspace(ctx: PluginContext): Workspace | null {
  const [ws, setWs] = useState<Workspace | null>(null);
  useEffect(() => {
    let alive = true;
    loadWorkspace(ctx)
      .then((w) => alive && setWs(w))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ctx]);
  return ws;
}

function SearchBox({ value, onSubmit }: { value: string; onSubmit(query: string): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      value={draft}
      placeholder="Search issues"
      aria-label="Search issues"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSubmit(draft)}
      onBlur={() => draft !== value && onSubmit(draft)}
      style={{ flex: 1 }}
    />
  );
}

function Controls({ p, scope, ws, setProps }: { p: Props; scope: "open" | "cycle"; ws: Workspace | null; setProps(patch: Partial<Props>): void }) {
  switch (p.filter) {
    case "mine":
      return (
        <Select value={scope} aria-label="Scope" onChange={(e) => setProps({ scope: e.target.value === "cycle" ? "cycle" : "open" })}>
          <option value="open">All open issues</option>
          <option value="cycle">Active cycle</option>
        </Select>
      );
    case "team":
      return (
        <Select value={p.team ?? ""} aria-label="Team" onChange={(e) => setProps({ team: e.target.value })}>
          <option value="" disabled>
            Team…
          </option>
          {p.team && !ws?.teams.some((t) => t.key === p.team) ? <option value={p.team}>{p.team}</option> : null}
          {ws?.teams.map((t) => (
            <option key={t.id} value={t.key}>
              {t.name}
            </option>
          ))}
        </Select>
      );
    case "search":
      return <SearchBox value={p.query ?? ""} onSubmit={(query) => setProps({ query })} />;
    case "project":
      return (
        <Select value={p.project ?? ""} aria-label="Project" onChange={(e) => setProps({ project: e.target.value })}>
          <option value="" disabled>
            Project…
          </option>
          {p.project && !ws?.projects.some((x) => x.name === p.project) ? <option value={p.project}>{p.project}</option> : null}
          {ws?.projects
            .filter((x) => x.status.type !== "canceled")
            .map((x) => (
              <option key={x.id} value={x.name}>
                {x.name}
              </option>
            ))}
        </Select>
      );
  }
}

function ProjectHeader({ project }: { project: ProjectDetail }) {
  const facts = [
    project.status.name,
    project.lead ? `Lead ${project.lead.name}` : null,
    `${Math.round(project.progress * 100)}% done`,
    project.targetDate ? `Target ${project.targetDate}` : null,
  ].filter(Boolean);
  return (
    <Stack gap={1} className="ln-project">
      <Text size="lg" weight={600}>
        {project.name}
      </Text>
      <Text size="sm" tone="muted">
        {facts.join(" · ")}
      </Text>
    </Stack>
  );
}

function titleOf(p: Props): string {
  switch (p.filter) {
    case "mine":
      return "My Linear issues";
    case "team":
      return p.team ? `Linear · ${p.team}` : "Linear team";
    case "search":
      return p.query ? `Linear · “${p.query}”` : "Linear search";
    case "project":
      return p.project ? `Linear · ${p.project}` : "Linear project";
  }
}

export const list = defineKind<Props>({
  description:
    "A list of Linear issues grouped by state; clicking one opens linear.issue. props: { filter: 'mine'|'team'|'search'|'project', team?, project?, query?, scope?: 'open'|'cycle' }.",
  props,
  defaultSize: { w: 480, h: 640 },
  component: function ListWindow({ item, props: p, setProps, setTitle, ctx, active }) {
    const settingScope = useMineScope();
    const scope = p.scope ?? settingScope;
    const ws = useWorkspace(ctx);
    const blocked = missing(p);
    const key = JSON.stringify({ ...p, scope });
    const query = useQuery(key, () => (blocked ? Promise.resolve({ issues: [] }) : load(ctx, p, scope)), () => true, active);
    const title = titleOf(p);
    useEffect(() => {
      if (title !== item.title) setTitle(title);
    }, [title, item.title, setTitle]);

    const groups = query.data ? groupByState(query.data.issues) : [];
    return (
      <div className="ln-frame">
        <Stack gap={2} className="ln-bar">
          <Row gap={2}>
            <Tabs value={p.filter} label="Filter" options={filters.map((value) => ({ value, label: filterLabels[value] }))} onChange={(filter) => setProps({ filter })} />
            <div style={{ flex: 1 }} />
            {query.loading ? <Spinner /> : null}
            <IconButton label="Refresh" size="sm" onClick={query.refresh}>
              <RefreshCw size={13} />
            </IconButton>
          </Row>
          <Row gap={2}>
            <Controls p={p} scope={scope} ws={ws} setProps={setProps} />
          </Row>
        </Stack>
        <div className="ln-body dn-scroll">
          {query.error && !query.data ? (
            <Failure error={query.error} ctx={ctx} onRetry={query.refresh} />
          ) : blocked ? (
            <Empty title={blocked} />
          ) : query.data ? (
            <Stack gap={3}>
              {query.data.project ? <ProjectHeader project={query.data.project} /> : null}
              {query.error ? (
                <Text size="sm" style={{ color: "var(--dn-err)" }}>
                  {query.error}
                </Text>
              ) : null}
              {groups.length === 0 ? <Empty title="No issues" /> : null}
              {groups.map((g) => (
                <Stack key={g.state} gap={1}>
                  <Row gap={2}>
                    <Dot />
                    <Label>{g.state}</Label>
                    <Text size="xs" tone="faint">
                      {g.issues.length}
                    </Text>
                  </Row>
                  <List>
                    {g.issues.map((issue) => (
                      <IssueItem key={issue.id} issue={issue} ctx={ctx} showProject={p.filter !== "project"} />
                    ))}
                  </List>
                </Stack>
              ))}
            </Stack>
          ) : null}
        </div>
      </div>
    );
  },
});
