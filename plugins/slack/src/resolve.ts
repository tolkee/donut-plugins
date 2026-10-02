import type { AuthInfo, SlackConversation, SlackUser } from "./types";

export interface Directory {
  me: AuthInfo;
  users: SlackUser[];
  conversations: SlackConversation[];
  emoji: Record<string, string>;
}

export type ConversationKind = "channel" | "dm" | "mpim";

export interface ResolvedConversation {
  id: string;
  kind: ConversationKind;
  name: string;
}

export type ConversationTarget = ResolvedConversation | { needsOpen: string; name: string };

export interface MessageRef {
  channel: string;
  ts: string;
  thread_ts?: string;
}

export class ResolveError extends Error {
  override name = "ResolveError";
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const CONVERSATION_ID = /^[CGD][A-Z0-9]{6,}$/;
const USER_ID = /^[UW][A-Z0-9]{6,}$/;
const TS = /^\d{9,}\.\d{1,6}$/;

function choices(names: string[], limit = 20): string {
  const shown = names.slice(0, limit).join(", ");
  return names.length > limit ? `${shown}, … (${names.length - limit} more)` : shown || "none";
}

export function userName(user: SlackUser): string {
  return user.profile.display_name?.trim() || user.profile.real_name?.trim() || user.real_name?.trim() || user.name;
}

export function fullName(user: SlackUser): string {
  return user.profile.real_name?.trim() || user.real_name?.trim() || userName(user);
}

export function findUser(dir: Directory, id: string): SlackUser | undefined {
  return dir.users.find((u) => u.id === id);
}

export function nameOf(dir: Directory, userId: string): string {
  const user = findUser(dir, userId);
  return user ? fullName(user) : userId;
}

export function kindOf(conversation: SlackConversation): ConversationKind {
  if (conversation.is_im) return "dm";
  if (conversation.is_mpim) return "mpim";
  return "channel";
}

function mpimName(dir: Directory, name: string): string {
  const handles = name.replace(/^mpdm-/, "").replace(/-\d+$/, "").split("--");
  return handles
    .filter((h) => h !== dir.me.user)
    .map((h) => {
      const user = dir.users.find((u) => u.name === h);
      return user ? fullName(user) : h;
    })
    .join(", ");
}

export function conversationName(dir: Directory, conversation: SlackConversation): string {
  switch (kindOf(conversation)) {
    case "dm":
      return conversation.user ? nameOf(dir, conversation.user) : conversation.id;
    case "mpim":
      return mpimName(dir, conversation.name ?? conversation.id);
    case "channel":
      return `#${conversation.name ?? conversation.id}`;
  }
}

export function describeConversation(dir: Directory, conversation: SlackConversation): ResolvedConversation {
  return { id: conversation.id, kind: kindOf(conversation), name: conversationName(dir, conversation) };
}

export function conversationById(dir: Directory, id: string): ResolvedConversation {
  const known = dir.conversations.find((c) => c.id === id);
  if (known) return describeConversation(dir, known);
  return { id, kind: id.startsWith("D") ? "dm" : "channel", name: id };
}

export function matchUsers(dir: Directory, query: string): SlackUser[] {
  const q = query.trim().replace(/^@/, "").toLowerCase();
  if (!q) return [];
  const active = dir.users.filter((u) => !u.deleted);
  const exact = active.filter(
    (u) => u.id === query.trim() || same(u.name, q) || same(u.profile.email ?? "", q) || same(fullName(u), q) || same(userName(u), q),
  );
  if (exact.length) return exact;
  const words = (u: SlackUser) => [u.name, userName(u), fullName(u)].flatMap((n) => n.toLowerCase().split(/[\s._-]+/));
  return active.filter((u) => words(u).some((w) => w.startsWith(q)) || fullName(u).toLowerCase().startsWith(q));
}

export function resolveUser(dir: Directory, query: string): SlackUser {
  if (same(query, "me")) {
    const me = findUser(dir, dir.me.user_id);
    if (me) return me;
  }
  const users = matchUsers(dir, query);
  if (users.length === 1 && users[0]) return users[0];
  if (users.length === 0) throw new ResolveError(`no Slack user \`${query}\`; use find_user`);
  throw new ResolveError(`\`${query}\` matches several people: ${choices(users.map((u) => `${fullName(u)} (@${u.name}, ${u.id})`))}`);
}

export function parsePermalink(text: string): MessageRef | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!url.hostname.endsWith(".slack.com")) return null;
  const match = /\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/.exec(url.pathname);
  if (!match?.[1]) return null;
  const threadTs = url.searchParams.get("thread_ts");
  return { channel: match[1], ts: `${match[2]}.${match[3]}`, ...(threadTs && TS.test(threadTs) ? { thread_ts: threadTs } : {}) };
}

export function parseRef(text: string): MessageRef {
  const trimmed = text.trim();
  const link = parsePermalink(trimmed);
  if (link) return link;
  const [channel, ts, ...rest] = trimmed.split("/");
  if (channel && ts && rest.length === 0 && CONVERSATION_ID.test(channel) && TS.test(ts)) return { channel, ts };
  throw new ResolveError(`\`${text}\` is not a Slack message: pass "<channel id>/<ts>" (e.g. C0123ABCD/1727712345.123456) or a message link`);
}

export function refOf(channel: string, ts: string): string {
  return `${channel}/${ts}`;
}

export function permalinkOf(dir: Directory, channel: string, ts: string, threadTs?: string): string {
  const base = dir.me.url.endsWith("/") ? dir.me.url : `${dir.me.url}/`;
  const link = `${base}archives/${channel}/p${ts.replace(".", "")}`;
  return threadTs && threadTs !== ts ? `${link}?thread_ts=${threadTs}&cid=${channel}` : link;
}

function dmWith(dir: Directory, user: SlackUser): ConversationTarget {
  const dm = dir.conversations.find((c) => c.is_im && c.user === user.id);
  return dm ? { id: dm.id, kind: "dm", name: fullName(user) } : { needsOpen: user.id, name: fullName(user) };
}

export function resolveConversation(dir: Directory, query: string): ConversationTarget {
  const q = query.trim();
  const link = parsePermalink(q);
  if (link) return conversationById(dir, link.channel);
  if (CONVERSATION_ID.test(q)) return conversationById(dir, q);
  if (USER_ID.test(q)) return dmWith(dir, resolveUser(dir, q));
  if (q.startsWith("@") || q.includes("@") || same(q, "me")) return dmWith(dir, resolveUser(dir, q));
  const name = q.replace(/^#/, "");
  const channels = dir.conversations.filter((c) => kindOf(c) === "channel");
  const channel = channels.find((c) => same(c.name ?? "", name));
  if (channel) return describeConversation(dir, channel);
  if (q.startsWith("#")) throw new ResolveError(`no Slack channel \`${q}\` you're in; channels: ${choices(channels.map((c) => `#${c.name}`))}`);
  const users = matchUsers(dir, q);
  if (users.length === 1 && users[0]) return dmWith(dir, users[0]);
  const partial = channels.filter((c) => (c.name ?? "").toLowerCase().includes(name.toLowerCase()));
  const candidates = [...partial.map((c) => `#${c.name}`), ...users.map((u) => `${fullName(u)} (@${u.name})`)];
  if (candidates.length === 0) throw new ResolveError(`no Slack channel or person \`${q}\``);
  throw new ResolveError(`\`${q}\` is ambiguous: ${choices(candidates)}`);
}

export function tsAfter(a: string, b: string): boolean {
  const [ai = "0", af = ""] = a.split(".");
  const [bi = "0", bf = ""] = b.split(".");
  if (ai !== bi) return Number(ai) > Number(bi);
  return af.padEnd(6, "0") > bf.padEnd(6, "0");
}
