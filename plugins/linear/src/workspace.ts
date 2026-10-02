import { type Fetcher, gql } from "./api";
import { PROJECTS, type ProjectsData, WORKSPACE, type WorkspaceData } from "./queries";
import { ResolveError, type Workspace } from "./resolve";

const TTL_MS = 10 * 60_000;

let cached: { at: number; value: Promise<Workspace> } | null = null;

async function fetchWorkspace(ctx: Fetcher): Promise<Workspace> {
  const [ws, projects] = await Promise.all([gql<WorkspaceData>(ctx, WORKSPACE), gql<ProjectsData>(ctx, PROJECTS)]);
  return { viewer: ws.viewer, teams: ws.teams.nodes, labels: ws.issueLabels.nodes, users: ws.users.nodes, projects: projects.projects.nodes };
}

export function loadWorkspace(ctx: Fetcher, fresh = false): Promise<Workspace> {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = fetchWorkspace(ctx);
  cached = { at: Date.now(), value };
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });
  return value;
}

export function forgetWorkspace(): void {
  cached = null;
}

export async function withWorkspace<T>(ctx: Fetcher, run: (ws: Workspace) => T | Promise<T>): Promise<T> {
  try {
    return await run(await loadWorkspace(ctx));
  } catch (e) {
    if (!(e instanceof ResolveError)) throw e;
    return run(await loadWorkspace(ctx, true));
  }
}
