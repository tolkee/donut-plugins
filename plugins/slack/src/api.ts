import type { FetchRequest, FetchResponse } from "@donut/sdk";

export const API = "https://slack.com/api/";
export const TOKEN_KEY = "slack.token";
export const MISSING_TOKEN = "Slack token is not set (Settings → Slack)";

export interface Fetcher {
  fetch(request: FetchRequest): Promise<FetchResponse>;
}

export class SlackError extends Error {
  override name = "SlackError";
}

export type Params = Record<string, string | number | boolean | undefined>;

interface Reply {
  ok: boolean;
  error?: string;
  needed?: string;
  response_metadata?: { next_cursor?: string };
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function parse(body: string): Reply | null {
  try {
    return JSON.parse(body) as Reply;
  } catch {
    return null;
  }
}

function header(res: FetchResponse, name: string): string | undefined {
  return Object.entries(res.headers).find(([k]) => k.toLowerCase() === name)?.[1];
}

function rateLimited(res: FetchResponse): SlackError {
  const wait = Number(header(res, "retry-after"));
  return new SlackError(`Slack rate limit reached, try again in ${Number.isFinite(wait) && wait > 0 ? wait : 30} s`);
}

function failure(reply: Reply, res: FetchResponse): SlackError {
  switch (reply.error) {
    case "invalid_auth":
    case "not_authed":
    case "token_revoked":
    case "token_expired":
    case "account_inactive":
      return new SlackError("Slack rejected the token");
    case "missing_scope":
      return new SlackError(`Slack token lacks the ${reply.needed ?? "needed"} scope (reinstall the app with the manifest)`);
    case "ratelimited":
      return rateLimited(res);
    case "channel_not_found":
      return new SlackError("Slack conversation not found, or you can't see it");
    case "not_in_channel":
      return new SlackError("You're not a member of that Slack channel");
    case "thread_not_found":
    case "message_not_found":
      return new SlackError("Slack message not found");
    case "already_reacted":
      return new SlackError("You already reacted with that emoji");
    case "invalid_name":
      return new SlackError("Slack doesn't know that emoji");
    default:
      return new SlackError(`Slack error: ${reply.error ?? "unknown"}`);
  }
}

function query(params: Params): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function call<T>(ctx: Fetcher, method: string, params: Params = {}, { write = false } = {}): Promise<T> {
  const authorization = `Bearer {{secret:${TOKEN_KEY}}}`;
  const request: FetchRequest = write
    ? {
        url: `${API}${method}`,
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))),
      }
    : { url: `${API}${method}${query(params)}`, method: "GET", headers: { Authorization: authorization } };
  let res: FetchResponse;
  try {
    res = await ctx.fetch(request);
  } catch (e) {
    const message = errorMessage(e);
    throw new SlackError(message.includes(TOKEN_KEY) && message.includes("not set") ? MISSING_TOKEN : message);
  }
  if (res.status === 429) throw rateLimited(res);
  const reply = parse(res.body);
  if (!reply) throw new SlackError(`Slack returned HTTP ${res.status}`);
  if (!reply.ok) throw failure(reply, res);
  return reply as T;
}

export async function paginate<P, T>(ctx: Fetcher, method: string, params: Params, items: (page: P) => T[], cap: number): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await call<P & Reply>(ctx, method, { ...params, cursor });
    out.push(...items(page));
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor && out.length < cap);
  return out.slice(0, cap);
}
