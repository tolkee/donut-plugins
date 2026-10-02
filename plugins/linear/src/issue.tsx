import { defineKind, type PluginContext, shallowEqual, useDonut, z } from "@donut/sdk";
import { Badge, Button, Divider, Dot, Dropdown, Heading, IconButton, Label, List, ListItem, Markdown, Row, Spinner, Stack, Text } from "@donut/ui";
import { ExternalLink, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { errorMessage } from "./api";
import { useQuery } from "./hooks";
import { getIssue, updateIssue } from "./linear";
import type { IssueDetail } from "./queries";
import { PRIORITIES, type PriorityName, resolveTeam, teamStates } from "./resolve";
import { linkedCards, sameIssue } from "./cards";
import { Failure, showCard, stateTone } from "./view";
import { loadWorkspace } from "./workspace";

const props = z.object({ issueId: z.string().describe("Issue identifier (GLA-123) or id") });

const priorityOptions = (Object.keys(PRIORITIES) as PriorityName[]).map((value) => ({ value, label: value[0]?.toUpperCase() + value.slice(1) }));
const priorityName = (value: number) => (Object.entries(PRIORITIES).find(([, v]) => v === value)?.[0] ?? "none") as PriorityName;

function useStateOptions(ctx: PluginContext, teamId: string | undefined) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!teamId) return;
    let alive = true;
    loadWorkspace(ctx)
      .then((ws) => alive && setOptions(teamStates(resolveTeam(ws, teamId)).map((s) => ({ value: s.name, label: s.name }))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ctx, teamId]);
  return options;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Label>{label}</Label>
      <Row gap={1} wrap>
        {children}
      </Row>
    </>
  );
}

function DonutCards({ issue, ctx }: { issue: IssueDetail; ctx: PluginContext }) {
  const cards = useDonut((s) => linkedCards(s.boards, issue.identifier, issue.id), (a, b) => a.length === b.length && a.every((x, i) => shallowEqual(x, b[i])));
  if (cards.length === 0) return null;
  return (
    <Stack gap={1}>
      <Label>Donut cards</Label>
      <List>
        {cards.map(({ card, board, column }) => (
          <ListItem
            key={card.id}
            interactive
            role="button"
            tabIndex={0}
            aria-label={`Open card ${card.title}`}
            onClick={() => void showCard(ctx, card)}
            onKeyDown={(e) => e.key === "Enter" && void showCard(ctx, card)}
          >
            <Row gap={2} style={{ width: "100%", minWidth: 0 }}>
              <Text size="md" truncate style={{ flex: 1 }}>
                {card.title}
              </Text>
              <Text size="xs" tone="faint">
                {board.name} · {column}
              </Text>
            </Row>
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}

function IssueBody({ issue, ctx }: { issue: IssueDetail; ctx: PluginContext }) {
  const states = useStateOptions(ctx, issue.team.id);
  const [error, setError] = useState<string | null>(null);
  const change = (patch: Parameters<typeof updateIssue>[2]) =>
    void updateIssue(ctx, issue.identifier, patch).then(
      () => setError(null),
      (e: unknown) => setError(errorMessage(e)),
    );
  const none = (
    <Text size="sm" tone="faint">
      None
    </Text>
  );

  return (
    <Stack gap={3} padding={4} className="ln-issue dn-scroll">
      <Stack gap={1}>
        <Text size="sm" tone="muted" mono>
          {issue.identifier} · {issue.team.name}
        </Text>
        <Heading level={2}>{issue.title}</Heading>
      </Stack>
      <Row gap={2} wrap>
        <Dropdown label="State" value={issue.state.name} options={states.length ? states : [{ value: issue.state.name, label: issue.state.name }]} onChange={(state) => change({ state })}>
          <Dot tone={stateTone[issue.state.type] ?? "neutral"} /> {issue.state.name}
        </Dropdown>
        <Dropdown label="Priority" value={priorityName(issue.priority)} options={priorityOptions} onChange={(value) => change({ priority: value as PriorityName })}>
          {issue.priorityLabel}
        </Dropdown>
      </Row>
      {error ? (
        <Text size="sm" style={{ color: "var(--dn-err)" }}>
          {error}
        </Text>
      ) : null}
      <div className="ln-meta">
        <Meta label="Assignee">{issue.assignee ? <Badge>{issue.assignee.name}</Badge> : none}</Meta>
        <Meta label="Labels">{issue.labels.nodes.length ? issue.labels.nodes.map((l) => <Badge key={l.id}>{l.name}</Badge>) : none}</Meta>
        <Meta label="Project">
          {issue.project ? <Badge>{issue.project.name}</Badge> : none}
          {issue.projectMilestone ? <Badge>{issue.projectMilestone.name}</Badge> : null}
        </Meta>
        {issue.cycle ? (
          <Meta label="Cycle">
            <Badge>{issue.cycle.name ?? `Cycle ${issue.cycle.number}`}</Badge>
          </Meta>
        ) : null}
      </div>
      <DonutCards issue={issue} ctx={ctx} />
      <Divider />
      {issue.description?.trim() ? (
        <Markdown>{issue.description}</Markdown>
      ) : (
        <Text size="sm" tone="faint">
          No description
        </Text>
      )}
      {issue.attachments.nodes.length ? (
        <Stack gap={1}>
          <Label>Attachments</Label>
          {issue.attachments.nodes.map((a) => (
            <Button key={a.url} size="sm" variant="ghost" aria-label={`Open attachment ${a.title}`} onClick={() => void ctx.openExternal(a.url)} style={{ alignSelf: "flex-start" }}>
              <ExternalLink size={12} /> {a.title}
            </Button>
          ))}
        </Stack>
      ) : null}
      {issue.comments.nodes.length ? (
        <Stack gap={2}>
          <Label>Comments</Label>
          {[...issue.comments.nodes]
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map((c) => (
              <div key={c.id} className="ln-comment">
                <Text size="xs" tone="muted">
                  {c.user?.name ?? "Linear"} · {new Date(c.createdAt).toLocaleString()}
                </Text>
                <Markdown>{c.body}</Markdown>
              </div>
            ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

export const issue = defineKind<z.infer<typeof props>>({
  description:
    "A Linear issue: state and priority (editable), assignee, labels, project, description and comments. props: { issueId } (identifier like GLA-123). Refreshes after linear__ writes.",
  props,
  defaultSize: { w: 560, h: 680 },
  component: function IssueWindow({ item, props: { issueId }, setTitle, ctx, active }) {
    const loaded = useRef<IssueDetail | null>(null);
    const query = useQuery(
      `issue:${issueId}`,
      () => getIssue(ctx, issueId),
      (id) => sameIssue(id, issueId) || (loaded.current !== null && (sameIssue(id, loaded.current.identifier) || id === loaded.current.id)),
      active,
    );
    loaded.current = query.data;
    const data = query.data;
    const title = data ? `${data.identifier} ${data.title}` : null;
    useEffect(() => {
      if (title && title !== item.title) setTitle(title);
    }, [title, item.title, setTitle]);

    return (
      <div className="ln-frame">
        <Row gap={2} className="ln-bar">
          <Text size="sm" tone="muted" mono style={{ flex: 1 }}>
            {data?.identifier ?? issueId}
          </Text>
          {query.loading ? <Spinner /> : null}
          {data ? (
            <Button size="sm" variant="ghost" onClick={() => void ctx.openExternal(data.url)}>
              <ExternalLink size={13} /> Open in Linear
            </Button>
          ) : null}
          <IconButton label="Refresh" size="sm" onClick={query.refresh}>
            <RefreshCw size={13} />
          </IconButton>
        </Row>
        {data ? (
          <IssueBody issue={data} ctx={ctx} />
        ) : query.error ? (
          <Failure error={query.error} ctx={ctx} onRetry={query.refresh} />
        ) : null}
      </div>
    );
  },
});
