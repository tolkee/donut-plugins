import type { FetchRequest, FetchResponse } from "@donut/sdk";

export const ENDPOINT = "https://api.linear.app/graphql";
export const TOKEN_KEY = "linear.token";
export const MISSING_TOKEN = "Linear API key is not set (Settings → Linear)";

export interface Fetcher {
  fetch(request: FetchRequest): Promise<FetchResponse>;
}

export class LinearError extends Error {
  override name = "LinearError";
}

interface GraphQLError {
  message: string;
  extensions?: { code?: string };
}

interface GraphQLReply<T> {
  data?: T | null;
  errors?: GraphQLError[];
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function parse<T>(body: string): GraphQLReply<T> | null {
  try {
    return JSON.parse(body) as GraphQLReply<T>;
  } catch {
    return null;
  }
}

export async function gql<T>(ctx: Fetcher, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let res: FetchResponse;
  try {
    res = await ctx.fetch({
      url: ENDPOINT,
      method: "POST",
      headers: { Authorization: `{{secret:${TOKEN_KEY}}}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch (e) {
    const message = errorMessage(e);
    throw new LinearError(message.includes(TOKEN_KEY) && message.includes("not set") ? MISSING_TOKEN : message);
  }
  const reply = parse<T>(res.body);
  const codes = reply?.errors?.map((e) => e.extensions?.code) ?? [];
  if (res.status === 401 || codes.includes("AUTHENTICATION_ERROR")) throw new LinearError("Linear rejected the API key");
  if (res.status === 429 || codes.includes("RATELIMITED")) throw new LinearError("Linear rate limit reached, try again in a minute");
  const first = reply?.errors?.[0];
  if (first) throw new LinearError(first.message);
  if (res.status >= 400 || !reply?.data) throw new LinearError(`Linear returned HTTP ${res.status}`);
  return reply.data;
}
