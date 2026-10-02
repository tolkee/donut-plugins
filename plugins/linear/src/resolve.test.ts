import { describe, expect, it } from "vitest";

import { issue, workspace as ws } from "./fixtures";
import { issueFilter, issueInput } from "./linear";
import { groupByState, priorityValue, resolveLabels, resolveMilestone, resolveProject, resolveState, resolveTeam, resolveUser } from "./resolve";

describe("resolve", () => {
  it("matches teams by id, key, then name, ignoring case", () => {
    expect(resolveTeam(ws, "t-vox").key).toBe("VOX");
    expect(resolveTeam(ws, "gla").id).toBe("t-gla");
    expect(resolveTeam(ws, "gladia core").id).toBe("t-gla");
    expect(() => resolveTeam(ws, "Nope")).toThrow("no team `Nope`; teams: GLA (Gladia Core), VOX (Vox)");
  });

  it("lists the valid states in workflow order on a miss", () => {
    expect(resolveState(ws, "t-gla", "in review").id).toBe("s-review");
    expect(() => resolveState(ws, "t-gla", "Review")).toThrow("no state `Review` in GLA; states: Backlog, Todo, In Progress, In Review, Done");
  });

  it("finds team and workspace labels only", () => {
    expect(resolveLabels(ws, "t-gla", ["bug", "API"]).map((l) => l.id)).toEqual(["l-bug", "l-api"]);
    expect(() => resolveLabels(ws, "t-gla", ["Phone"])).toThrow("no label `Phone` in GLA; labels: Bug, API");
  });

  it("finds users by me, email, name or display name", () => {
    expect(resolveUser(ws, "me").id).toBe("u-me");
    expect(resolveUser(ws, "ANA@gladia.io").id).toBe("u-ana");
    expect(resolveUser(ws, "ana silva").id).toBe("u-ana");
    expect(resolveUser(ws, "ana").id).toBe("u-ana");
    expect(() => resolveUser(ws, "bob")).toThrow("no user `bob`; users: me, Guillaume, Ana Silva");
  });

  it("finds projects and milestones, listing open projects on a miss", () => {
    const project = resolveProject(ws, "realtime V3");
    expect(project.id).toBe("p-rt");
    expect(resolveMilestone(project, "beta").id).toBe("m-beta");
    expect(() => resolveProject(ws, "x")).toThrow("no project `x`; projects: Realtime v3");
    expect(() => resolveMilestone(project, "GA")).toThrow("no milestone `GA` in Realtime v3; milestones: Beta");
  });

  it("maps priority names to Linear values", () => {
    expect(["urgent", "high", "medium", "low", "none"].map((p) => priorityValue(p as never))).toEqual([1, 2, 3, 4, 0]);
  });

  it("groups issues by state in workflow order, most urgent first", () => {
    const groups = groupByState([issue("GLA-3", "Done"), issue("GLA-1", "In Progress", 4), issue("GLA-2", "In Progress", 1), issue("GLA-4", "Todo")]);
    expect(groups.map((g) => [g.state, g.issues.map((i) => i.identifier)])).toEqual([
      ["Todo", ["GLA-4"]],
      ["In Progress", ["GLA-2", "GLA-1"]],
      ["Done", ["GLA-3"]],
    ]);
  });
});

describe("issue filters and inputs", () => {
  it("filters by resolved ids, or by state name without a team", () => {
    expect(issueFilter(ws, { team: "GLA", state: "todo", assignee: "me", project: "Realtime v3" })).toEqual({
      team: { id: { eq: "t-gla" } },
      state: { id: { eq: "s-todo" } },
      assignee: { id: { eq: "u-me" } },
      project: { id: { eq: "p-rt" } },
    });
    expect(issueFilter(ws, { state: "Todo" })).toEqual({ state: { name: { eqIgnoreCase: "Todo" } } });
  });

  const ref = { id: "id-GLA-1", identifier: "GLA-1", url: "", team: { id: "t-gla", key: "GLA", name: "Gladia Core" }, project: null };

  it("turns a patch into an update input", () => {
    expect(issueInput(ws, ref, { state: "In Review", priority: "high", assignee: null, labels: ["Bug"] })).toEqual({
      stateId: "s-review",
      priority: 2,
      assigneeId: null,
      labelIds: ["l-bug"],
    });
    expect(issueInput(ws, ref, { project: "Realtime v3", milestone: "Beta" })).toEqual({ projectId: "p-rt", projectMilestoneId: "m-beta" });
    expect(issueInput(ws, { ...ref, project: { id: "p-rt", name: "Realtime v3" } }, { project: null, milestone: null })).toEqual({ projectId: null, projectMilestoneId: null });
    expect(() => issueInput(ws, ref, { milestone: "Beta" })).toThrow("GLA-1 has no project");
  });
});
