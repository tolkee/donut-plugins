import type { SettingView } from "@donut/sdk";

import { type Fetcher, gql, LinearError } from "./api";
import { invalidate } from "./events";
import {
  COMMENT,
  type CommentPayload,
  CREATE_ISSUE,
  ISSUE,
  ISSUE_REF,
  type IssueData,
  type IssueDetail,
  type IssuePayload,
  type IssueRefData,
  type IssueRow,
  ISSUES,
  type IssuesData,
  MINE,
  type MineData,
  type Project,
  PROJECT_DETAIL,
  type ProjectDetail,
  type ProjectDetailData,
  PROJECTS,
  type ProjectsData,
  SEARCH,
  type SearchData,
  UPDATE_ISSUE,
} from "./queries";
import {
  type PriorityName,
  priorityValue,
  resolveLabels,
  resolveMilestone,
  resolveProject,
  resolveState,
  resolveTeam,
  resolveUser,
  type Workspace,
} from "./resolve";
import { withWorkspace } from "./workspace";

export type MineScope = "open" | "cycle";
export const MINE_SCOPE_KEY = "linear.mine_scope";

export function mineScopeOf(settings: SettingView[]): MineScope {
  const setting = settings.find((x) => x.key === MINE_SCOPE_KEY);
  return (setting?.value ?? setting?.default) === "cycle" ? "cycle" : "open";
}

const OPEN = { state: { type: { nin: ["completed", "canceled"] } } };

export interface IssueQuery {
  team?: string | undefined;
  state?: string | undefined;
  assignee?: string | undefined;
  project?: string | undefined;
}

export function issueFilter(ws: Workspace, query: IssueQuery): Record<string, unknown> {
  const team = query.team ? resolveTeam(ws, query.team) : undefined;
  return {
    ...(team ? { team: { id: { eq: team.id } } } : {}),
    ...(query.state ? { state: team ? { id: { eq: resolveState(ws, team.id, query.state).id } } : { name: { eqIgnoreCase: query.state } } } : {}),
    ...(query.assignee ? { assignee: { id: { eq: resolveUser(ws, query.assignee).id } } } : {}),
    ...(query.project ? { project: { id: { eq: resolveProject(ws, query.project).id } } } : {}),
  };
}

export async function searchIssues(ctx: Fetcher, term: string, query: IssueQuery = {}, limit = 25): Promise<IssueRow[]> {
  const filter = await withWorkspace(ctx, (ws) => issueFilter(ws, query));
  const data = await gql<SearchData>(ctx, SEARCH, { term, first: Math.min(limit, 50), filter });
  return data.searchIssues.nodes;
}

export async function myIssues(ctx: Fetcher, scope: MineScope, project?: string): Promise<IssueRow[]> {
  const projectFilter = project ? await withWorkspace(ctx, (ws) => issueFilter(ws, { project })) : {};
  const filter = { ...OPEN, ...(scope === "cycle" ? { cycle: { isActive: { eq: true } } } : {}), ...projectFilter };
  const data = await gql<MineData>(ctx, MINE, { filter });
  return data.viewer.assignedIssues.nodes;
}

export async function teamIssues(ctx: Fetcher, team: string): Promise<IssueRow[]> {
  const filter = await withWorkspace(ctx, (ws) => ({ ...OPEN, ...issueFilter(ws, { team }) }));
  const data = await gql<IssuesData>(ctx, ISSUES, { filter });
  return data.issues.nodes;
}

export async function getIssue(ctx: Fetcher, id: string): Promise<IssueDetail> {
  const data = await gql<IssueData>(ctx, ISSUE, { id });
  return data.issue;
}

export async function listProjects(ctx: Fetcher): Promise<Project[]> {
  const data = await gql<ProjectsData>(ctx, PROJECTS);
  return data.projects.nodes;
}

export async function getProject(ctx: Fetcher, project: string): Promise<ProjectDetail> {
  const id = await withWorkspace(ctx, (ws) => resolveProject(ws, project).id);
  const data = await gql<ProjectDetailData>(ctx, PROJECT_DETAIL, { id });
  return data.project;
}

function written(payload: IssuePayload, action: string): { identifier: string; url: string } {
  if (!payload.success || !payload.issue) throw new LinearError(`Linear did not ${action} the issue`);
  invalidate(payload.issue.identifier);
  return payload.issue;
}

export interface NewIssue {
  team: string;
  title: string;
  description?: string | undefined;
  priority?: PriorityName | undefined;
  labels?: string[] | undefined;
  assignee?: string | undefined;
  project?: string | undefined;
  milestone?: string | undefined;
}

export async function createIssue(ctx: Fetcher, issue: NewIssue): Promise<{ identifier: string; url: string }> {
  const input = await withWorkspace(ctx, (ws) => {
    const team = resolveTeam(ws, issue.team);
    const project = issue.project ? resolveProject(ws, issue.project) : undefined;
    if (issue.milestone && !project) throw new LinearError("a milestone needs a project");
    return {
      teamId: team.id,
      title: issue.title,
      ...(issue.description !== undefined ? { description: issue.description } : {}),
      ...(issue.priority ? { priority: priorityValue(issue.priority) } : {}),
      ...(issue.labels?.length ? { labelIds: resolveLabels(ws, team.id, issue.labels).map((l) => l.id) } : {}),
      ...(issue.assignee ? { assigneeId: resolveUser(ws, issue.assignee).id } : {}),
      ...(project ? { projectId: project.id } : {}),
      ...(project && issue.milestone ? { projectMilestoneId: resolveMilestone(project, issue.milestone).id } : {}),
    };
  });
  const data = await gql<{ issueCreate: IssuePayload }>(ctx, CREATE_ISSUE, { input });
  return written(data.issueCreate, "create");
}

export interface IssuePatch {
  state?: string | undefined;
  priority?: PriorityName | undefined;
  assignee?: string | null | undefined;
  title?: string | undefined;
  description?: string | undefined;
  labels?: string[] | undefined;
  project?: string | null | undefined;
  milestone?: string | null | undefined;
}

export function issueInput(ws: Workspace, issue: IssueRefData["issue"], patch: IssuePatch): Record<string, unknown> {
  const teamId = issue.team.id;
  const projectOf = () => {
    const target = patch.project !== undefined ? patch.project : (issue.project?.id ?? null);
    return target === null ? null : resolveProject(ws, target);
  };
  const milestoneId = (name: string) => {
    const project = projectOf();
    if (!project) throw new LinearError(`${issue.identifier} has no project, so it can't have a milestone`);
    return resolveMilestone(project, name).id;
  };
  return {
    ...(patch.state !== undefined ? { stateId: resolveState(ws, teamId, patch.state).id } : {}),
    ...(patch.priority !== undefined ? { priority: priorityValue(patch.priority) } : {}),
    ...(patch.assignee !== undefined ? { assigneeId: patch.assignee === null ? null : resolveUser(ws, patch.assignee).id } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.labels !== undefined ? { labelIds: resolveLabels(ws, teamId, patch.labels).map((l) => l.id) } : {}),
    ...(patch.project !== undefined ? { projectId: projectOf()?.id ?? null } : {}),
    ...(patch.milestone !== undefined ? { projectMilestoneId: patch.milestone === null ? null : milestoneId(patch.milestone) } : {}),
  };
}

async function issueRef(ctx: Fetcher, id: string): Promise<IssueRefData["issue"]> {
  const data = await gql<IssueRefData>(ctx, ISSUE_REF, { id });
  return data.issue;
}

export async function updateIssue(ctx: Fetcher, id: string, patch: IssuePatch): Promise<{ identifier: string; url: string; changed: string[] }> {
  const issue = await issueRef(ctx, id);
  const input = await withWorkspace(ctx, (ws) => issueInput(ws, issue, patch));
  const changed = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (changed.length === 0) throw new LinearError("nothing to change");
  const data = await gql<{ issueUpdate: IssuePayload }>(ctx, UPDATE_ISSUE, { id: issue.id, input });
  return { ...written(data.issueUpdate, "update"), changed };
}

export async function comment(ctx: Fetcher, id: string, body: string): Promise<{ identifier: string; url: string }> {
  const issue = await issueRef(ctx, id);
  const data = await gql<{ commentCreate: CommentPayload }>(ctx, COMMENT, { input: { issueId: issue.id, body } });
  if (!data.commentCreate.success) throw new LinearError("Linear did not add the comment");
  invalidate(issue.identifier);
  return { identifier: issue.identifier, url: data.commentCreate.comment?.url ?? issue.url };
}
