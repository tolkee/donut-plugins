import type { CanvasItem, PluginContext } from "@donut/sdk";
import { Badge, Button, Empty, ListItem, Row, Stack, Text } from "@donut/ui";

import { MISSING_TOKEN } from "./api";
import { ago, authorOf, previewText } from "./format";
import { conversationById, type Directory, parsePermalink } from "./resolve";
import type { SearchMatch } from "./types";

export const CONVERSATION_KIND = "slack.conversation";
export const LIST_KIND = "slack.list";

export type ListFilter = "unread" | "mentions" | "search";

function propsOf(item: CanvasItem): Record<string, unknown> | null {
  return typeof item.props === "object" && item.props !== null && !Array.isArray(item.props) ? item.props : null;
}

export function conversationWindow(items: Record<string, CanvasItem>, channel: string, threadTs?: string): CanvasItem | undefined {
  return Object.values(items).find((item) => {
    const props = item.kind === CONVERSATION_KIND ? propsOf(item) : null;
    return props?.channel === channel && (props.thread_ts ?? undefined) === threadTs;
  });
}

export async function showConversation(ctx: PluginContext, target: { channel: string; thread_ts?: string | undefined }, title?: string): Promise<void> {
  const existing = conversationWindow(ctx.runtime.getState().canvas.items, target.channel, target.thread_ts);
  if (existing) await ctx.canvas.focus(existing.id);
  else await ctx.canvas.open(CONVERSATION_KIND, target.thread_ts ? { channel: target.channel, thread_ts: target.thread_ts } : { channel: target.channel }, title);
}

export function openSettings(ctx: PluginContext): Promise<unknown> {
  return ctx.command({ domain: "app", command: { op: "set_ui", settings_open: true, settings_section: "slack" } });
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

function threadOf(match: SearchMatch): string | undefined {
  const link = match.permalink ? parsePermalink(match.permalink) : null;
  if (link?.thread_ts) return link.thread_ts;
  return match.thread_ts;
}

function conversationLabel(dir: Directory, match: SearchMatch): string {
  const known = dir.conversations.some((c) => c.id === match.channel.id);
  if (known || match.channel.is_im || match.channel.is_mpim) return conversationById(dir, match.channel.id).name;
  return `#${match.channel.name ?? match.channel.id}`;
}

function activate(open: () => void) {
  return { onClick: open, onKeyDown: (e: { key: string }) => e.key === "Enter" && open() };
}

export function MessageItem({ match, dir, ctx }: { match: SearchMatch; dir: Directory; ctx: PluginContext }) {
  const where = conversationLabel(dir, match);
  const thread = threadOf(match);
  const author = authorOf(dir, match);
  const open = () => void showConversation(ctx, { channel: match.channel.id, thread_ts: thread }, thread ? `Thread in ${where}` : where);
  return (
    <ListItem interactive role="button" tabIndex={0} aria-label={`Open message from ${author} in ${where}`} {...activate(open)}>
      <Stack gap={1} style={{ minWidth: 0, width: "100%" }}>
        <Row gap={2}>
          <Text size="sm" weight={600} truncate style={{ flex: "none", maxWidth: "45%" }}>
            {author}
          </Text>
          <Text size="xs" tone="muted" truncate style={{ flex: 1 }}>
            {where}
            {thread ? " · thread" : ""}
          </Text>
          <Text size="xs" tone="faint" style={{ flex: "none" }}>
            {ago(match.ts)}
          </Text>
        </Row>
        <Text size="sm" tone="muted" className="sl-preview">
          {previewText(dir, match.text)}
        </Text>
      </Stack>
    </ListItem>
  );
}

export function ConversationItem({ channel, messages, dir, ctx }: { channel: string; messages: SearchMatch[]; dir: Directory; ctx: PluginContext }) {
  const name = conversationById(dir, channel).name;
  const latest = messages[0];
  const open = () => void showConversation(ctx, { channel }, `DM ${name}`);
  return (
    <ListItem interactive role="button" tabIndex={0} aria-label={`Open DM with ${name}`} {...activate(open)}>
      <Stack gap={1} style={{ minWidth: 0, width: "100%" }}>
        <Row gap={2}>
          <Text size="sm" weight={600} truncate style={{ flex: 1 }}>
            {name}
          </Text>
          <Badge>{messages.length}</Badge>
          {latest ? (
            <Text size="xs" tone="faint" style={{ flex: "none" }}>
              {ago(latest.ts)}
            </Text>
          ) : null}
        </Row>
        {latest ? (
          <Text size="sm" tone="muted" className="sl-preview">
            {previewText(dir, latest.text)}
          </Text>
        ) : null}
      </Stack>
    </ListItem>
  );
}
