import { defineKind, type PluginContext, z } from "@donut/sdk";
import { Empty, IconButton, Input, Label, List, Row, Spinner, Stack, Tabs, Text } from "@donut/ui";
import { RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { loadDirectory } from "./directory";
import { useQuery } from "./hooks";
import type { Directory } from "./resolve";
import { search } from "./slack";
import type { SearchMatch } from "./types";
import { loadUnreads, type Unreads } from "./unreads";
import { ConversationItem, Failure, type ListFilter, MessageItem } from "./view";

const filters = ["unread", "mentions", "search"] as const satisfies readonly ListFilter[];

const props = z.object({
  filter: z.enum(filters).describe("unread: unread DMs and mentions; mentions: recent mentions of the user; search: Slack search"),
  query: z.string().optional().describe("Search text, Slack search syntax (search mode)"),
});
type Props = z.infer<typeof props>;

const filterLabels: Record<ListFilter, string> = { unread: "Unread", mentions: "Mentions", search: "Search" };

type Loaded = { dir: Directory; unreads: Unreads } | { dir: Directory; matches: SearchMatch[]; total: number };

async function load(ctx: PluginContext, p: Props): Promise<Loaded> {
  switch (p.filter) {
    case "unread":
      return loadUnreads(ctx);
    case "mentions": {
      const dir = await loadDirectory(ctx);
      const result = await search(ctx, `<@${dir.me.user_id}>`, { count: 50, sort: "timestamp" });
      return { dir, matches: result.matches.filter((m) => m.user !== dir.me.user_id), total: result.total };
    }
    case "search": {
      const dir = await loadDirectory(ctx);
      const result = await search(ctx, p.query ?? "", { count: 50, sort: "timestamp" });
      return { dir, matches: result.matches, total: result.total };
    }
  }
}

function SearchBox({ value, onSubmit }: { value: string; onSubmit(query: string): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      value={draft}
      placeholder="Search Slack (in:#channel from:@person)"
      aria-label="Search Slack"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSubmit(draft)}
      onBlur={() => draft !== value && onSubmit(draft)}
      style={{ flex: 1 }}
    />
  );
}

function titleOf(p: Props): string {
  switch (p.filter) {
    case "unread":
      return "Slack · Unread";
    case "mentions":
      return "Slack · Mentions";
    case "search":
      return p.query ? `Slack · “${p.query}”` : "Slack search";
  }
}

function Section({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <Stack gap={1}>
      <Row gap={2}>
        <Label>{label}</Label>
        <Text size="xs" tone="faint">
          {count}
        </Text>
      </Row>
      <List>{children}</List>
    </Stack>
  );
}

function Results({ data, ctx }: { data: Loaded; ctx: PluginContext }) {
  if ("unreads" in data) {
    const { dms, mentions } = data.unreads;
    if (dms.length === 0 && mentions.length === 0) return <Empty title="Nothing unread in the last two days" />;
    return (
      <Stack gap={3}>
        {dms.length ? (
          <Section label="Direct messages" count={dms.length}>
            {dms.map((dm) => (
              <ConversationItem key={dm.channel} channel={dm.channel} messages={dm.messages} dir={data.dir} ctx={ctx} />
            ))}
          </Section>
        ) : null}
        {mentions.length ? (
          <Section label="Mentions" count={mentions.length}>
            {mentions.map((m) => (
              <MessageItem key={`${m.channel.id}/${m.ts}`} match={m} dir={data.dir} ctx={ctx} />
            ))}
          </Section>
        ) : null}
      </Stack>
    );
  }
  if (data.matches.length === 0) return <Empty title="No messages" />;
  return (
    <Section label="Messages" count={data.total}>
      {data.matches.map((m) => (
        <MessageItem key={`${m.channel.id}/${m.ts}`} match={m} dir={data.dir} ctx={ctx} />
      ))}
    </Section>
  );
}

export const list = defineKind<Props>({
  description:
    "Slack lists: unread DMs and mentions, recent mentions, or search results; clicking a row opens slack.conversation. props: { filter: 'unread'|'mentions'|'search', query? }.",
  props,
  defaultSize: { w: 460, h: 620 },
  component: function ListWindow({ item, props: p, setProps, setTitle, ctx, active }) {
    const blocked = p.filter === "search" && !p.query?.trim();
    const query = useQuery(JSON.stringify(p), () => (blocked ? Promise.reject(new Error("Type something to search")) : load(ctx, p)), () => true, active);
    const title = titleOf(p);
    useEffect(() => {
      if (title !== item.title) setTitle(title);
    }, [title, item.title, setTitle]);

    return (
      <div className="sl-frame">
        <Stack gap={2} className="sl-bar">
          <Row gap={2}>
            <Tabs value={p.filter} label="Filter" options={filters.map((value) => ({ value, label: filterLabels[value] }))} onChange={(filter) => setProps({ filter })} />
            <div style={{ flex: 1 }} />
            {query.loading ? <Spinner /> : null}
            <IconButton label="Refresh" size="sm" onClick={query.refresh}>
              <RefreshCw size={13} />
            </IconButton>
          </Row>
          {p.filter === "search" ? (
            <Row gap={2}>
              <SearchBox value={p.query ?? ""} onSubmit={(q) => setProps({ query: q })} />
            </Row>
          ) : null}
        </Stack>
        <div className="sl-body dn-scroll">
          {blocked ? (
            <Empty title="Type something to search" />
          ) : query.data && !query.loading ? (
            <Stack gap={3}>
              {query.error ? (
                <Text size="sm" style={{ color: "var(--dn-err)" }}>
                  {query.error}
                </Text>
              ) : null}
              <Results data={query.data} ctx={ctx} />
            </Stack>
          ) : query.error ? (
            <Failure error={query.error} ctx={ctx} onRetry={query.refresh} />
          ) : null}
        </div>
      </div>
    );
  },
});
