import type { IssueRow, Label, Milestone, Project, Ref, Team, User } from "./queries";

export interface Workspace {
  viewer: Ref;
  teams: Team[];
  labels: Label[];
  users: User[];
  projects: Project[];
}

export class ResolveError extends Error {
  override name = "ResolveError";
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function choices(names: string[], limit = 40): string {
  const shown = names.slice(0, limit).join(", ");
  return names.length > limit ? `${shown}, … (${names.length - limit} more)` : shown || "none";
}

export function resolveTeam(ws: Workspace, query: string): Team {
  const team = ws.teams.find((t) => t.id === query) ?? ws.teams.find((t) => same(t.key, query)) ?? ws.teams.find((t) => same(t.name, query));
  if (!team) throw new ResolveError(`no team \`${query}\`; teams: ${choices(ws.teams.map((t) => `${t.key} (${t.name})`))}`);
  return team;
}

export function teamStates(team: Team) {
  return [...team.states.nodes].sort((a, b) => a.position - b.position);
}

export function resolveState(ws: Workspace, teamId: string, query: string) {
  const team = resolveTeam(ws, teamId);
  const states = teamStates(team);
  const state = states.find((s) => s.id === query) ?? states.find((s) => same(s.name, query));
  if (!state) throw new ResolveError(`no state \`${query}\` in ${team.key}; states: ${choices(states.map((s) => s.name))}`);
  return state;
}

export function teamLabels(ws: Workspace, teamId: string): Label[] {
  return ws.labels.filter((l) => l.team === null || l.team.id === teamId);
}

export function resolveLabels(ws: Workspace, teamId: string, names: string[]): Label[] {
  const team = resolveTeam(ws, teamId);
  const labels = teamLabels(ws, team.id);
  return names.map((name) => {
    const label = labels.find((l) => l.id === name) ?? labels.find((l) => same(l.name, name));
    if (!label) throw new ResolveError(`no label \`${name}\` in ${team.key}; labels: ${choices(labels.map((l) => l.name))}`);
    return label;
  });
}

export function resolveUser(ws: Workspace, query: string): Ref {
  if (same(query, "me")) return ws.viewer;
  const user =
    ws.users.find((u) => u.id === query) ??
    ws.users.find((u) => same(u.email, query)) ??
    ws.users.find((u) => same(u.name, query)) ??
    ws.users.find((u) => same(u.displayName, query));
  if (!user) throw new ResolveError(`no user \`${query}\`; users: me, ${choices(ws.users.map((u) => u.name))}`);
  return user;
}

export function resolveProject(ws: Workspace, query: string): Project {
  const project = ws.projects.find((p) => p.id === query) ?? ws.projects.find((p) => same(p.name, query));
  if (!project) {
    const open = ws.projects.filter((p) => p.status.type !== "canceled" && p.status.type !== "completed");
    throw new ResolveError(`no project \`${query}\`; projects: ${choices(open.map((p) => p.name))}`);
  }
  return project;
}

export function resolveMilestone(project: Project, query: string): Milestone {
  const milestones = project.projectMilestones.nodes;
  const milestone = milestones.find((m) => m.id === query) ?? milestones.find((m) => same(m.name, query));
  if (!milestone) throw new ResolveError(`no milestone \`${query}\` in ${project.name}; milestones: ${choices(milestones.map((m) => m.name))}`);
  return milestone;
}

export const PRIORITIES = { none: 0, urgent: 1, high: 2, medium: 3, low: 4 } as const;
export type PriorityName = keyof typeof PRIORITIES;

export function priorityValue(name: PriorityName): number {
  return PRIORITIES[name];
}

export function issueSummary(issue: IssueRow) {
  return {
    identifier: issue.identifier,
    title: issue.title,
    state: issue.state.name,
    assignee: issue.assignee?.name ?? null,
    priority: issue.priorityLabel,
    project: issue.project?.name ?? null,
    url: issue.url,
  };
}

export interface StateGroup {
  state: string;
  type: string;
  issues: IssueRow[];
}

const TYPE_ORDER = ["triage", "backlog", "unstarted", "started", "completed", "canceled"];

export function groupByState(issues: IssueRow[]): StateGroup[] {
  const groups = new Map<string, StateGroup & { position: number }>();
  for (const issue of issues) {
    const group = groups.get(issue.state.name);
    if (group) group.issues.push(issue);
    else groups.set(issue.state.name, { state: issue.state.name, type: issue.state.type, position: issue.state.position, issues: [issue] });
  }
  const rank = (type: string) => {
    const index = TYPE_ORDER.indexOf(type);
    return index === -1 ? TYPE_ORDER.length : index;
  };
  return [...groups.values()]
    .sort((a, b) => rank(a.type) - rank(b.type) || a.position - b.position)
    .map(({ state, type, issues }) => ({ state, type, issues: [...issues].sort((a, b) => (a.priority || 5) - (b.priority || 5)) }));
}
