import { defineTool, z } from "@donut/sdk";

import { comment, createIssue, getIssue, getProject, listProjects, mineScopeOf, myIssues, searchIssues, updateIssue } from "./linear";
import type { IssueDetail, IssueRow, Project } from "./queries";
import { groupByState, issueSummary, PRIORITIES, type PriorityName, resolveTeam, teamLabels, teamStates } from "./resolve";
import { linkedCards } from "./cards";
import { loadWorkspace } from "./workspace";

const CONFIRM =
  "Writes to the user's shared Linear workspace. Donut holds the call until the user confirms: when it says so, say the exact change aloud and ask once.";

const priority = z.enum(Object.keys(PRIORITIES) as [PriorityName, ...PriorityName[]]).describe("urgent, high, medium, low or none");
const issueId = z.string().min(1).describe("Issue identifier (GLA-123) or id");
const projectStates = ["backlog", "planned", "started", "paused", "completed", "canceled"] as const;

function grouped(issues: IssueRow[]) {
  return Object.fromEntries(groupByState(issues).map((g) => [g.state, g.issues.map(issueSummary)]));
}

function projectSummary(p: Project) {
  return {
    id: p.id,
    name: p.name,
    state: p.status.name,
    lead: p.lead?.name ?? null,
    progress: `${Math.round(p.progress * 100)}%`,
    targetDate: p.targetDate,
    teams: p.teams.nodes.map((t) => t.key),
    url: p.url,
  };
}

export function issueDetail(issue: IssueDetail) {
  return {
    ...issueSummary(issue),
    team: issue.team.key,
    labels: issue.labels.nodes.map((l) => l.name),
    milestone: issue.projectMilestone?.name ?? null,
    cycle: issue.cycle ? (issue.cycle.name ?? `Cycle ${issue.cycle.number}`) : null,
    updatedAt: issue.updatedAt,
    description: issue.description ?? "",
    comments: issue.comments.nodes.map((c) => ({ author: c.user?.name ?? "Linear", at: c.createdAt, body: c.body })),
    attachments: issue.attachments.nodes,
  };
}

export const tools = {
  list_teams: defineTool({
    description: "List Linear teams with their key, name, workflow states (name, type) and labels. Use it to turn team, state and label names into valid values.",
    input: z.object({}),
    run: async (_input, ctx) => {
      const ws = await loadWorkspace(ctx, true);
      return ws.teams.map((t) => ({
        key: t.key,
        name: t.name,
        states: teamStates(t).map((s) => ({ name: s.name, type: s.type })),
        labels: teamLabels(ws, t.id).map((l) => l.name),
      }));
    },
  }),
  search_issues: defineTool({
    description: "Search Linear issues by text, optionally within a team (key or name), state, assignee ('me', a name or an email) or project. Returns [{identifier, title, state, assignee, priority, project, url}].",
    input: z.object({
      query: z.string().min(1),
      team: z.string().optional(),
      state: z.string().optional(),
      assignee: z.string().optional(),
      project: z.string().optional().describe("Project name or id"),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    run: async ({ query, limit, ...filter }, ctx) => (await searchIssues(ctx, query, filter, limit)).map(issueSummary),
  }),
  my_issues: defineTool({
    description: "The user's open Linear issues (scope 'cycle': only the active cycle; default: the linear.mine_scope setting), optionally in one project. Returns {stateName: [{identifier, title, state, assignee, priority, project, url}]}.",
    input: z.object({ scope: z.enum(["open", "cycle"]).optional(), project: z.string().optional().describe("Project name or id") }),
    run: async ({ scope, project }, ctx) => grouped(await myIssues(ctx, scope ?? mineScopeOf(ctx.runtime.getState().settings), project)),
  }),
  get_issue: defineTool({
    description: "Read one Linear issue: state, priority, assignee, team, labels, project, milestone, cycle, description, comments, attachments and the Donut kanban cards linked to it.",
    input: z.object({ id: issueId }),
    run: async ({ id }, ctx) => {
      const issue = await getIssue(ctx, id);
      const cards = linkedCards(ctx.runtime.getState().boards, issue.identifier, issue.id).map(({ card, board, column }) => ({ card_id: card.id, title: card.title, board: board.name, column }));
      return { ...issueDetail(issue), donut_cards: cards };
    },
  }),
  list_projects: defineTool({
    description: "List Linear projects, optionally of one team, in one state, or whose name contains query. Returns [{id, name, state, lead, progress, targetDate, teams, url}].",
    input: z.object({ team: z.string().optional(), state: z.enum(projectStates).optional(), query: z.string().optional() }),
    run: async ({ team, state, query }, ctx) => {
      const teamId = team ? resolveTeam(await loadWorkspace(ctx), team).id : undefined;
      return (await listProjects(ctx))
        .filter((p) => !teamId || p.teams.nodes.some((t) => t.id === teamId))
        .filter((p) => !state || p.status.type === state)
        .filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()))
        .map(projectSummary);
    },
  }),
  get_project: defineTool({
    description: "Read one Linear project (name or id): description, lead, progress, target date, milestones, and its issues grouped by state.",
    input: z.object({ project: z.string().min(1) }),
    run: async ({ project }, ctx) => {
      const p = await getProject(ctx, project);
      return { ...projectSummary(p), description: p.description, milestones: p.projectMilestones.nodes.map((m) => m.name), issues: grouped(p.issues.nodes) };
    },
  }),
  create_issue: defineTool({
    description: `Create a Linear issue in a team (key or name), with optional description (markdown), priority, labels, assignee ('me', a name or an email), project and milestone (names). Returns {identifier, url}. ${CONFIRM}`,
    input: z.object({
      team: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      priority: priority.optional(),
      labels: z.array(z.string()).optional(),
      assignee: z.string().optional(),
      project: z.string().optional(),
      milestone: z.string().optional(),
    }),
    mainOnly: true,
    effect: "write",
    confirm: { title: "Create a Linear issue in {team}", detailFields: ["title", "description", "priority", "labels", "assignee", "project", "milestone"] },
    run: (input, ctx) => createIssue(ctx, input),
  }),
  update_issue: defineTool({
    description: `Change a Linear issue: state (name), priority, assignee (null unassigns), title, description, labels (replaces them), project (null removes it), milestone (null removes it). Returns {identifier, url, changed}. ${CONFIRM}`,
    input: z.object({
      id: issueId,
      state: z.string().optional(),
      priority: priority.optional(),
      assignee: z.string().nullable().optional(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      labels: z.array(z.string()).optional(),
      project: z.string().nullable().optional(),
      milestone: z.string().nullable().optional(),
    }),
    mainOnly: true,
    effect: "write",
    confirm: { title: "Change {id} in Linear", detailFields: ["state", "priority", "assignee", "title", "description", "labels", "project", "milestone"] },
    run: ({ id, ...patch }, ctx) => updateIssue(ctx, id, patch),
  }),
  comment: defineTool({
    description: `Add a markdown comment to a Linear issue. Returns {identifier, url}. ${CONFIRM} A session working on a kanban card linked to a Linear issue may comment on that issue only, without asking.`,
    input: z.object({ id: issueId, body: z.string().min(1) }),
    mainOnly: true,
    effect: "write",
    confirm: { title: "Comment on {id} in Linear", detailField: "body" },
    sessionScope: { provider: "linear", inputField: "id" },
    run: ({ id, body }, ctx) => comment(ctx, id, body),
  }),
};
