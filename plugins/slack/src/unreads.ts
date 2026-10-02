import type { Fetcher } from "./api";
import { loadDirectory } from "./directory";
import type { Directory } from "./resolve";
import { tsAfter } from "./resolve";
import { onInvalidate } from "./events";
import { info, search } from "./slack";
import type { SearchMatch } from "./types";

export const MAX_CHANNELS = 15;
const CONCURRENCY = 4;
const LAST_READ_TTL_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

export interface UnreadDm {
  channel: string;
  messages: SearchMatch[];
}

export interface Unreads {
  dms: UnreadDm[];
  mentions: SearchMatch[];
}

const isDm = (m: SearchMatch) => Boolean(m.channel.is_im || m.channel.is_mpim);
const mentions = (m: SearchMatch, me: string) => (m.text ?? "").includes(`<@${me}>`) || (m.text ?? "").includes(`<@${me}|`);

export function relevant(matches: SearchMatch[], me: string): SearchMatch[] {
  return matches.filter((m) => m.user !== me && (isDm(m) || mentions(m, me)));
}

export function channelsToCheck(matches: SearchMatch[], me: string): string[] {
  const sorted = [...relevant(matches, me)].sort((a, b) => (tsAfter(a.ts, b.ts) ? -1 : 1));
  return [...new Set(sorted.map((m) => m.channel.id))].slice(0, MAX_CHANNELS);
}

export function computeUnreads(matches: SearchMatch[], lastReads: Record<string, string | undefined>, me: string): Unreads {
  const checked = new Set(channelsToCheck(matches, me));
  const unread = relevant(matches, me)
    .filter((m) => checked.has(m.channel.id))
    .filter((m) => {
      const lastRead = lastReads[m.channel.id];
      return lastRead === undefined || tsAfter(m.ts, lastRead);
    })
    .sort((a, b) => (tsAfter(a.ts, b.ts) ? -1 : 1));
  const dms = new Map<string, SearchMatch[]>();
  for (const m of unread.filter(isDm)) dms.set(m.channel.id, [...(dms.get(m.channel.id) ?? []), m]);
  return {
    dms: [...dms].map(([channel, messages]) => ({ channel, messages })),
    mentions: unread.filter((m) => !isDm(m)),
  };
}

const lastReadCache = new Map<string, { at: number; value: string | undefined }>();

async function lastRead(ctx: Fetcher, channel: string): Promise<string | undefined> {
  const hit = lastReadCache.get(channel);
  if (hit && Date.now() - hit.at < LAST_READ_TTL_MS) return hit.value;
  const value = (await info(ctx, channel)).last_read;
  lastReadCache.set(channel, { at: Date.now(), value });
  return value;
}

export function forgetLastRead(channel: string | "all"): void {
  if (channel === "all") lastReadCache.clear();
  else lastReadCache.delete(channel);
}

async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  return out;
}

export function searchQuery(me: string, now = Date.now()): string {
  const since = new Date(now - 2 * DAY_MS).toISOString().slice(0, 10);
  return `-from:<@${me}> after:${since}`;
}

export async function loadUnreads(ctx: Fetcher): Promise<{ dir: Directory; unreads: Unreads }> {
  const dir = await loadDirectory(ctx);
  const me = dir.me.user_id;
  const { matches } = await search(ctx, searchQuery(me), { count: 100, sort: "timestamp" });
  const channels = channelsToCheck(matches, me);
  const reads = await inBatches(channels, CONCURRENCY, async (channel) => [channel, await lastRead(ctx, channel).catch(() => undefined)] as const);
  return { dir, unreads: computeUnreads(matches, Object.fromEntries(reads), me) };
}

onInvalidate(forgetLastRead);
