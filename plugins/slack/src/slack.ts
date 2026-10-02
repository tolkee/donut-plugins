import { call, type Fetcher, paginate, SlackError } from "./api";
import { withDirectory } from "./directory";
import { invalidate } from "./events";
import { type ConversationTarget, type ResolvedConversation, resolveConversation } from "./resolve";
import type { SearchMatch, SlackConversation, SlackMessage } from "./types";

export interface Page {
  messages: SlackMessage[];
  more: boolean;
}

export async function history(ctx: Fetcher, channel: string, options: { limit: number; oldest?: string; latest?: string }): Promise<Page> {
  const reply = await call<{ messages: SlackMessage[]; has_more?: boolean }>(ctx, "conversations.history", {
    channel,
    limit: options.limit,
    oldest: options.oldest,
    latest: options.latest,
  });
  return { messages: [...reply.messages].reverse(), more: reply.has_more ?? false };
}

export async function replies(ctx: Fetcher, channel: string, ts: string, limit = 100): Promise<Page> {
  const reply = await call<{ messages: SlackMessage[]; has_more?: boolean }>(ctx, "conversations.replies", { channel, ts, limit });
  return { messages: reply.messages, more: reply.has_more ?? false };
}

export async function info(ctx: Fetcher, channel: string): Promise<SlackConversation> {
  return (await call<{ channel: SlackConversation }>(ctx, "conversations.info", { channel })).channel;
}

export async function publicChannels(ctx: Fetcher): Promise<SlackConversation[]> {
  return paginate<{ channels: SlackConversation[] }, SlackConversation>(
    ctx,
    "conversations.list",
    { types: "public_channel", exclude_archived: true, limit: 1000 },
    (p) => p.channels,
    5000,
  );
}

export interface SearchResult {
  total: number;
  matches: SearchMatch[];
}

export async function search(ctx: Fetcher, query: string, options: { count: number; sort: "timestamp" | "score" }): Promise<SearchResult> {
  const reply = await call<{ messages: { total: number; matches: SearchMatch[] } }>(ctx, "search.messages", {
    query,
    count: options.count,
    sort: options.sort,
    sort_dir: "desc",
  });
  return { total: reply.messages.total, matches: reply.messages.matches };
}

export async function openDm(ctx: Fetcher, userId: string): Promise<string> {
  return (await call<{ channel: { id: string } }>(ctx, "conversations.open", { users: userId }, { write: true })).channel.id;
}

export async function target(ctx: Fetcher, conversation: string): Promise<ConversationTarget> {
  return withDirectory(ctx, (dir) => resolveConversation(dir, conversation));
}

export async function existing(ctx: Fetcher, conversation: string): Promise<ResolvedConversation> {
  const found = await target(ctx, conversation);
  if ("needsOpen" in found) throw new SlackError(`you have no DM with ${found.name} yet`);
  return found;
}

export async function permalink(ctx: Fetcher, channel: string, ts: string): Promise<string> {
  return (await call<{ permalink: string }>(ctx, "chat.getPermalink", { channel, message_ts: ts })).permalink;
}

export async function postMessage(ctx: Fetcher, message: { channel: string; text: string; thread_ts?: string }): Promise<{ channel: string; ts: string }> {
  const reply = await call<{ channel: string; ts: string }>(ctx, "chat.postMessage", { ...message, unfurl_links: false }, { write: true });
  invalidate(reply.channel);
  return { channel: reply.channel, ts: reply.ts };
}

export async function react(ctx: Fetcher, reaction: { channel: string; timestamp: string; name: string }): Promise<void> {
  await call(ctx, "reactions.add", reaction, { write: true });
  invalidate(reaction.channel);
}
