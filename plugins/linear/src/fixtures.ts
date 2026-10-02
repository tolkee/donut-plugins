import type { IssueRow } from "./queries";
import type { Workspace } from "./resolve";

export const workspace: Workspace = {
  viewer: { id: "u-me", name: "Guillaume" },
  teams: [
    {
      id: "t-gla",
      key: "GLA",
      name: "Gladia Core",
      states: {
        nodes: [
          { id: "s-done", name: "Done", type: "completed", position: 4 },
          { id: "s-backlog", name: "Backlog", type: "backlog", position: 0 },
          { id: "s-todo", name: "Todo", type: "unstarted", position: 1 },
          { id: "s-progress", name: "In Progress", type: "started", position: 2 },
          { id: "s-review", name: "In Review", type: "started", position: 3 },
        ],
      },
    },
    { id: "t-vox", key: "VOX", name: "Vox", states: { nodes: [{ id: "v-todo", name: "Todo", type: "unstarted", position: 0 }] } },
  ],
  labels: [
    { id: "l-bug", name: "Bug", team: null },
    { id: "l-api", name: "API", team: { id: "t-gla" } },
    { id: "l-phone", name: "Phone", team: { id: "t-vox" } },
  ],
  users: [
    { id: "u-me", name: "Guillaume", displayName: "guillaume", email: "g@gladia.io" },
    { id: "u-ana", name: "Ana Silva", displayName: "ana", email: "ana@gladia.io" },
  ],
  projects: [
    {
      id: "p-rt",
      name: "Realtime v3",
      url: "https://linear.app/p/rt",
      progress: 0.4,
      targetDate: "2026-12-01",
      status: { name: "In Progress", type: "started" },
      lead: { name: "Ana Silva" },
      teams: { nodes: [{ id: "t-gla", key: "GLA" }] },
      projectMilestones: { nodes: [{ id: "m-beta", name: "Beta" }] },
    },
    {
      id: "p-old",
      name: "Old thing",
      url: "https://linear.app/p/old",
      progress: 1,
      targetDate: null,
      status: { name: "Completed", type: "completed" },
      lead: null,
      teams: { nodes: [{ id: "t-vox", key: "VOX" }] },
      projectMilestones: { nodes: [] },
    },
  ],
};

export function issue(identifier: string, state: string, priority = 3): IssueRow {
  const team = workspace.teams[0]!;
  const s = team.states.nodes.find((x) => x.name === state)!;
  return {
    id: `id-${identifier}`,
    identifier,
    title: `Title of ${identifier}`,
    url: `https://linear.app/gladia/issue/${identifier}`,
    priority,
    priorityLabel: "Medium",
    state: s,
    assignee: { id: "u-me", name: "Guillaume" },
    team: { id: team.id, key: team.key, name: team.name },
    labels: { nodes: [] },
    project: { id: "p-rt", name: "Realtime v3" },
    cycle: null,
    updatedAt: "2026-10-01T10:00:00Z",
  };
}
