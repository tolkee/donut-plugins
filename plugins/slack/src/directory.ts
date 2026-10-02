import { call, type Fetcher, paginate } from "./api";
import { type Directory, ResolveError } from "./resolve";
import type { AuthInfo, SlackConversation, SlackUser } from "./types";

const TTL_MS = 30 * 60_000;
const MAX_USERS = 5000;
const MAX_CONVERSATIONS = 2000;

let cached: { at: number; value: Promise<Directory> } | null = null;

async function loadEmoji(ctx: Fetcher): Promise<Record<string, string>> {
  try {
    return (await call<{ emoji: Record<string, string> }>(ctx, "emoji.list")).emoji;
  } catch {
    return {};
  }
}

async function fetchDirectory(ctx: Fetcher): Promise<Directory> {
  const [me, users, conversations, emoji] = await Promise.all([
    call<AuthInfo>(ctx, "auth.test"),
    paginate<{ members: SlackUser[] }, SlackUser>(ctx, "users.list", { limit: 200 }, (p) => p.members, MAX_USERS),
    paginate<{ channels: SlackConversation[] }, SlackConversation>(
      ctx,
      "users.conversations",
      { types: "public_channel,private_channel,mpim,im", exclude_archived: true, limit: 200 },
      (p) => p.channels,
      MAX_CONVERSATIONS,
    ),
    loadEmoji(ctx),
  ]);
  return { me, users, conversations, emoji };
}

export function loadDirectory(ctx: Fetcher, fresh = false): Promise<Directory> {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = fetchDirectory(ctx);
  cached = { at: Date.now(), value };
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });
  return value;
}

export function forgetDirectory(): void {
  cached = null;
}

export async function withDirectory<T>(ctx: Fetcher, run: (dir: Directory) => T | Promise<T>): Promise<T> {
  try {
    return await run(await loadDirectory(ctx));
  } catch (e) {
    if (!(e instanceof ResolveError)) throw e;
    return run(await loadDirectory(ctx, true));
  }
}
