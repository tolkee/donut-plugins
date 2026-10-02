import type { CanvasItem, Card, PluginContext } from "@donut/sdk";
import { Badge, Button, Dot, Empty, ListItem, Row, Text, type Tone } from "@donut/ui";

import { MISSING_TOKEN } from "./api";
import { sameIssue } from "./cards";
import type { IssueRow } from "./queries";

export const ISSUE_KIND = "linear.issue";
export const LIST_KIND = "linear.list";

export const stateTone: Record<string, Tone> = { started: "busy", completed: "ok", canceled: "neutral", unstarted: "neutral", backlog: "neutral", triage: "warn" };

function issueWindow(items: Record<string, CanvasItem>, issueId: string): CanvasItem | undefined {
  return Object.values(items).find((item) => {
    if (item.kind !== ISSUE_KIND || typeof item.props !== "object" || item.props === null || Array.isArray(item.props)) return false;
    const id = item.props.issueId;
    return typeof id === "string" && sameIssue(id, issueId);
  });
}

export async function showIssue(ctx: PluginContext, issueId: string, title?: string): Promise<void> {
  const existing = issueWindow(ctx.runtime.getState().canvas.items, issueId);
  if (existing) await ctx.canvas.focus(existing.id);
  else await ctx.canvas.open(ISSUE_KIND, { issueId }, title);
}

export async function showCard(ctx: PluginContext, card: Card): Promise<void> {
  await ctx.canvas.open("kanban.card", { card_id: card.id }, card.title);
}

export async function showMine(ctx: PluginContext): Promise<void> {
  const existing = Object.values(ctx.runtime.getState().canvas.items).find(
    (item) => item.kind === LIST_KIND && typeof item.props === "object" && item.props !== null && !Array.isArray(item.props) && item.props.filter === "mine",
  );
  if (existing) await ctx.canvas.focus(existing.id);
  else await ctx.canvas.open(LIST_KIND, { filter: "mine" }, "My Linear issues");
}

export function openSettings(ctx: PluginContext): Promise<unknown> {
  return ctx.command({ domain: "app", command: { op: "set_ui", settings_open: true, settings_section: "linear" } });
}

export function Failure({ error, ctx, onRetry }: { error: string; ctx: PluginContext; onRetry(): void }) {
  return (
    <Empty title={error}>
      {error === MISSING_TOKEN ? (
        <Button size="sm" onClick={() => void openSettings(ctx)}>
          Open settings
        </Button>
      ) : (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Empty>
  );
}

export function IssueItem({ issue, ctx, showProject = true }: { issue: IssueRow; ctx: PluginContext; showProject?: boolean }) {
  return (
    <ListItem
      interactive
      role="button"
      tabIndex={0}
      aria-label={`Open ${issue.identifier} ${issue.title}`}
      onClick={() => void showIssue(ctx, issue.identifier, `${issue.identifier} ${issue.title}`)}
      onKeyDown={(e) => e.key === "Enter" && void showIssue(ctx, issue.identifier, `${issue.identifier} ${issue.title}`)}
    >
      <Row gap={2} style={{ minWidth: 0, width: "100%" }}>
        <Dot tone={stateTone[issue.state.type] ?? "neutral"} />
        <Text size="sm" tone="muted" mono style={{ flex: "none" }}>
          {issue.identifier}
        </Text>
        <Text size="md" truncate style={{ flex: 1 }}>
          {issue.title}
        </Text>
        {showProject && issue.project ? <Badge>{issue.project.name}</Badge> : null}
        {issue.priority > 0 ? (
          <Text size="xs" tone="faint" style={{ flex: "none" }}>
            {issue.priorityLabel}
          </Text>
        ) : null}
      </Row>
    </ListItem>
  );
}
