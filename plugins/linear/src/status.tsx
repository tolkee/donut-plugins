import type { PluginContext, StatusBadge, StatusItemProps } from "@donut/sdk";
import { defineStatusItem } from "@donut/sdk";
import { Label, List, Spinner, Stack, Text } from "@donut/ui";

import { TOKEN_KEY } from "./api";
import { mineIssues, useMine, useTokenSet } from "./hooks";
import { mineScopeOf } from "./linear";
import { groupByState } from "./resolve";
import { IssueItem, showMine } from "./view";

export function computeMine(ctx: PluginContext): StatusBadge | null {
  const { settings } = ctx.runtime.getState();
  if (!settings.find((s) => s.key === TOKEN_KEY)?.is_set) {
    mineIssues.halt();
    return null;
  }
  mineIssues.ensure(ctx, mineScopeOf(settings));
  const { issues, error } = mineIssues.snapshot;
  return { text: `Linear ${issues ? issues.length : "…"}`, dot: error ? "err" : undefined };
}

function MinePopover({ ctx }: StatusItemProps) {
  const { issues, error, scope } = useMine(ctx);
  if (!useTokenSet()) return null;
  return (
    <Stack gap={2} className="ln-pop">
      <Label>{scope === "cycle" ? "My issues in the active cycle" : "My open issues"}</Label>
      {error ? (
        <Text size="sm" tone="faint">
          {error}
        </Text>
      ) : null}
      {issues === null ? (
        error ? null : (
          <Spinner />
        )
      ) : issues.length === 0 ? (
        <Text size="sm" tone="muted">
          Nothing assigned to you
        </Text>
      ) : (
        groupByState(issues).map((g) => (
          <Stack key={g.state} gap={1}>
            <Text size="xs" tone="faint">
              {g.state}
            </Text>
            <List>
              {g.issues.map((issue) => (
                <IssueItem key={issue.id} issue={issue} ctx={ctx} />
              ))}
            </List>
          </Stack>
        ))
      )}
      <Text size="xs" tone="faint">
        Click for the full list
      </Text>
    </Stack>
  );
}

export const mine = defineStatusItem({
  label: "Linear issues",
  description: "Count of my open Linear issues (setting linear.mine_scope: all open or the active cycle). Hover lists them, click one to open it; click opens linear.list {filter:'mine'}.",
  compute: computeMine,
  popover: MinePopover,
  onClick: showMine,
  defaultEnabled: false,
  order: 30,
});
