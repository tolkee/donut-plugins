import { defineKind, type PluginContext, z } from "@donut/sdk";
import { Badge, Button, IconButton, Row, Spinner, Stack, Text } from "@donut/ui";
import { ArrowLeft, ExternalLink, Paperclip, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { errorMessage } from "./api";
import { loadDirectory } from "./directory";
import { authorOf, fileSize, isConversational, isThreadRoot, names, tsDate } from "./format";
import { useQuery } from "./hooks";
import { conversationById, describeConversation, type Directory, findUser, permalinkOf, type ResolvedConversation } from "./resolve";
import { history, info, replies } from "./slack";
import { SlackText } from "./text";
import type { SlackConversation, SlackFile, SlackMessage } from "./types";
import { Failure } from "./view";

const props = z.object({
  channel: z.string().describe("Channel or DM id (C…/D…/G…)"),
  thread_ts: z.string().optional().describe("Thread root ts: show that thread"),
});
type Props = z.infer<typeof props>;

const PAGE = 50;
const RUN_GAP_S = 5 * 60;

interface Loaded {
  dir: Directory;
  conversation: ResolvedConversation;
  info: SlackConversation | null;
  messages: SlackMessage[];
  more: boolean;
}

async function load(ctx: PluginContext, p: Props): Promise<Loaded> {
  const dir = await loadDirectory(ctx);
  const [about, page] = await Promise.all([
    info(ctx, p.channel).catch(() => null),
    p.thread_ts ? replies(ctx, p.channel, p.thread_ts, 200) : history(ctx, p.channel, { limit: PAGE }),
  ]);
  const conversation = about ? describeConversation(dir, about) : conversationById(dir, p.channel);
  return { dir, conversation, info: about, messages: page.messages.filter(isConversational), more: !p.thread_ts && page.more };
}

function titleOf(conversation: ResolvedConversation, thread: boolean): string {
  if (thread) return `Thread in ${conversation.name}`;
  return conversation.kind === "channel" ? conversation.name : `DM ${conversation.name}`;
}

function Avatar({ message, dir }: { message: SlackMessage; dir: Directory }) {
  const image = message.user ? findUser(dir, message.user)?.profile.image_48 : undefined;
  const [broken, setBroken] = useState(false);
  if (image && !broken) return <img className="sl-avatar" src={image} alt="" onError={() => setBroken(true)} />;
  return (
    <span className="sl-avatar" aria-hidden>
      {authorOf(dir, message).slice(0, 1).toUpperCase()}
    </span>
  );
}

function FileRow({ file, link, ctx }: { file: SlackFile; link: string; ctx: PluginContext }) {
  const facts = [file.pretty_type ?? file.filetype, fileSize(file.size)].filter(Boolean).join(" · ");
  const name = file.name ?? file.title ?? "file";
  return (
    <Row gap={2} className="sl-file">
      <Paperclip size={12} />
      <Text size="sm" truncate style={{ flex: 1 }}>
        {name}
      </Text>
      {facts ? (
        <Text size="xs" tone="faint">
          {facts}
        </Text>
      ) : null}
      <Button size="sm" variant="ghost" aria-label={`Open ${name} in Slack`} onClick={() => void ctx.openExternal(file.permalink ?? link)}>
        Open in Slack
      </Button>
    </Row>
  );
}

function Reactions({ message, dir }: { message: SlackMessage; dir: Directory }) {
  if (!message.reactions?.length) return null;
  const emoji = names(dir).emoji;
  return (
    <Row gap={1} wrap>
      {message.reactions.map((r) => (
        <Badge key={r.name} title={`:${r.name}:`}>
          {emoji(r.name.split("::")[0] ?? r.name) ?? `:${r.name}:`} {r.count}
        </Badge>
      ))}
    </Row>
  );
}

function sameRun(a: SlackMessage | undefined, b: SlackMessage): boolean {
  if (!a) return false;
  const author = (m: SlackMessage) => m.user ?? m.bot_id ?? m.username;
  return author(a) === author(b) && tsDate(b.ts).toDateString() === tsDate(a.ts).toDateString() && Number(b.ts) - Number(a.ts) < RUN_GAP_S && !isThreadRoot(a);
}

function MessageView({
  message,
  previous,
  dir,
  channel,
  ctx,
  onThread,
}: {
  message: SlackMessage;
  previous: SlackMessage | undefined;
  dir: Directory;
  channel: string;
  ctx: PluginContext;
  onThread?: (ts: string) => void;
}) {
  const continued = sameRun(previous, message);
  const link = permalinkOf(dir, channel, message.ts, message.thread_ts);
  const time = tsDate(message.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="sl-message" data-continued={continued || undefined}>
      <div className="sl-gutter">{continued ? null : <Avatar message={message} dir={dir} />}</div>
      <Stack gap={1} style={{ minWidth: 0, flex: 1 }}>
        {continued ? null : (
          <Row gap={2}>
            <Text size="sm" weight={600}>
              {authorOf(dir, message)}
            </Text>
            <Text size="xs" tone="faint">
              {time}
            </Text>
          </Row>
        )}
        {message.text ? <SlackText text={message.text} dir={dir} ctx={ctx} /> : null}
        {message.files?.map((f) => <FileRow key={f.id} file={f} link={link} ctx={ctx} />)}
        <Reactions message={message} dir={dir} />
        {onThread && isThreadRoot(message) ? (
          <Button size="sm" variant="ghost" style={{ alignSelf: "flex-start" }} onClick={() => onThread(message.ts)}>
            {message.reply_count} {message.reply_count === 1 ? "reply" : "replies"}
          </Button>
        ) : null}
      </Stack>
    </div>
  );
}

function Messages({
  messages,
  after,
  dir,
  channel,
  ctx,
  onThread,
}: {
  messages: SlackMessage[];
  after?: SlackMessage | undefined;
  dir: Directory;
  channel: string;
  ctx: PluginContext;
  onThread?: (ts: string) => void;
}) {
  return (
    <>
      {messages.map((m, i) => {
        const previous = i === 0 ? after : messages[i - 1];
        const day = tsDate(m.ts).toDateString();
        const newDay = !previous || tsDate(previous.ts).toDateString() !== day;
        return (
          <div key={m.ts}>
            {newDay ? (
              <Row gap={2} className="sl-day">
                <Text size="xs" tone="faint">
                  {tsDate(m.ts).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
                </Text>
              </Row>
            ) : null}
            <MessageView message={m} previous={newDay ? undefined : previous} dir={dir} channel={channel} ctx={ctx} {...(onThread ? { onThread } : {})} />
          </div>
        );
      })}
    </>
  );
}

function useOlder(ctx: PluginContext, channel: string, key: string) {
  const [older, setOlder] = useState<{ messages: SlackMessage[]; more: boolean | null; loading: boolean; error: string | null }>({
    messages: [],
    more: null,
    loading: false,
    error: null,
  });
  useEffect(() => setOlder({ messages: [], more: null, loading: false, error: null }), [key]);
  const loadOlder = (before: string) => {
    setOlder((o) => ({ ...o, loading: true }));
    history(ctx, channel, { limit: PAGE, latest: before }).then(
      (page) => setOlder((o) => ({ messages: [...page.messages.filter(isConversational), ...o.messages], more: page.more, loading: false, error: null })),
      (e: unknown) => setOlder((o) => ({ ...o, loading: false, error: errorMessage(e) })),
    );
  };
  return { older, loadOlder };
}

export const conversation = defineKind<Props>({
  description:
    "A Slack channel, DM or thread, rendered readably (names, emoji, links, files, reactions); 'N replies' opens the thread in place, Back returns. props: { channel: channel/DM id, thread_ts?: thread root ts }. Read-only: post with slack__send_message.",
  props,
  defaultSize: { w: 520, h: 640 },
  component: function ConversationWindow({ item, props: p, setProps, setTitle, ctx, active }) {
    const key = `${p.channel}/${p.thread_ts ?? ""}`;
    const query = useQuery(key, () => load(ctx, p), (channel) => channel === p.channel, active);
    const { older, loadOlder } = useOlder(ctx, p.channel, key);
    const data = query.data;
    const body = useRef<HTMLDivElement>(null);
    const scrolledFor = useRef<string | null>(null);
    useEffect(() => {
      if (!data || scrolledFor.current === key || !body.current) return;
      scrolledFor.current = key;
      body.current.scrollTop = p.thread_ts ? 0 : body.current.scrollHeight;
    }, [data, key, p.thread_ts]);
    const title = data ? titleOf(data.conversation, Boolean(p.thread_ts)) : null;
    useEffect(() => {
      if (title && title !== item.title) setTitle(title);
    }, [title, item.title, setTitle]);

    const messages = data ? [...older.messages, ...data.messages] : [];
    const more = older.more ?? data?.more ?? false;
    const topic = data?.info?.topic?.value || data?.info?.purpose?.value;
    const link = data ? (p.thread_ts ? permalinkOf(data.dir, p.channel, p.thread_ts) : `${data.dir.me.url.replace(/\/?$/, "/")}archives/${p.channel}`) : null;
    const [root, ...rest] = p.thread_ts ? messages : [];

    return (
      <div className="sl-frame">
        <Row gap={2} className="sl-bar">
          {p.thread_ts ? (
            <IconButton label="Back to the conversation" size="sm" onClick={() => setProps({ thread_ts: null })}>
              <ArrowLeft size={13} />
            </IconButton>
          ) : null}
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" weight={600} truncate>
              {title ?? p.channel}
            </Text>
            {topic && !p.thread_ts ? (
              <Text size="xs" tone="muted" truncate>
                {topic}
              </Text>
            ) : null}
          </Stack>
          {query.loading ? <Spinner /> : null}
          {link ? (
            <Button size="sm" variant="ghost" onClick={() => void ctx.openExternal(link)}>
              <ExternalLink size={13} /> Open in Slack
            </Button>
          ) : null}
          <IconButton label="Refresh" size="sm" onClick={query.refresh}>
            <RefreshCw size={13} />
          </IconButton>
        </Row>
        <div ref={body} className="sl-body dn-scroll">
          {data ? (
            <Stack gap={1}>
              {query.error ? (
                <Text size="sm" style={{ color: "var(--dn-err)" }}>
                  {query.error}
                </Text>
              ) : null}
              {more && !p.thread_ts ? (
                <Button size="sm" variant="ghost" style={{ alignSelf: "center" }} disabled={older.loading} onClick={() => messages[0] && loadOlder(messages[0].ts)}>
                  {older.loading ? "Loading…" : "Load older"}
                </Button>
              ) : null}
              {older.error ? (
                <Text size="sm" style={{ color: "var(--dn-err)" }}>
                  {older.error}
                </Text>
              ) : null}
              {messages.length === 0 ? (
                <Text size="sm" tone="faint">
                  No messages
                </Text>
              ) : null}
              {p.thread_ts ? (
                <>
                  {root ? <Messages messages={[root]} dir={data.dir} channel={p.channel} ctx={ctx} /> : null}
                  <Row gap={2} className="sl-day">
                    <Text size="xs" tone="faint">
                      {rest.length} {rest.length === 1 ? "reply" : "replies"}
                    </Text>
                  </Row>
                  <Messages messages={rest} after={root} dir={data.dir} channel={p.channel} ctx={ctx} />
                </>
              ) : (
                <Messages messages={messages} dir={data.dir} channel={p.channel} ctx={ctx} onThread={(ts) => setProps({ thread_ts: ts })} />
              )}
            </Stack>
          ) : query.error ? (
            <Failure error={query.error} ctx={ctx} onRetry={query.refresh} />
          ) : null}
        </div>
      </div>
    );
  },
});
