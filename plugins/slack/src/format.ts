import { lookupEmoji } from "./emoji";
import { type Names, parseMrkdwn, plainText } from "./mrkdwn";
import { conversationName, type Directory, nameOf, refOf } from "./resolve";
import type { SlackFile, SlackMessage } from "./types";
import { untrusted } from "./untrusted";

const KEPT_SUBTYPES = new Set(["thread_broadcast", "file_share", "me_message"]);

export function isConversational(message: SlackMessage): boolean {
  return message.subtype === undefined || KEPT_SUBTYPES.has(message.subtype);
}

export function names(dir: Directory): Names {
  return {
    user: (id) => (dir.users.some((u) => u.id === id) ? nameOf(dir, id) : undefined),
    channel: (id) => {
      const conversation = dir.conversations.find((c) => c.id === id);
      return conversation ? conversationName(dir, conversation).replace(/^#/, "") : undefined;
    },
    emoji: (name, skin) => {
      const found = lookupEmoji(name, dir.emoji, skin);
      return found && "unicode" in found ? found.unicode : undefined;
    },
  };
}

export function authorOf(dir: Directory, message: SlackMessage): string {
  if (message.user) return nameOf(dir, message.user);
  return message.bot_profile?.name ?? message.username ?? "Slack";
}

export function tsDate(ts: string): Date {
  return new Date(Number(ts.split(".")[0]) * 1000);
}

export function ago(ts: string, now = Date.now()): string {
  const minutes = Math.floor((now - tsDate(ts).getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return tsDate(ts).toISOString().slice(0, 10);
}

export function fileLabel(file: SlackFile): string {
  const name = file.name ?? file.title ?? "file";
  const type = file.pretty_type ?? file.filetype;
  return type ? `${name} (${type})` : name;
}

export function reactionsOf(dir: Directory, message: SlackMessage): string | undefined {
  if (!message.reactions?.length) return undefined;
  const emoji = names(dir).emoji;
  return message.reactions.map((r) => `${emoji(r.name.split("::")[0] ?? r.name) ?? `:${r.name}:`} ${r.count}`).join(", ");
}

export function isThreadRoot(message: SlackMessage): boolean {
  return (message.reply_count ?? 0) > 0 && (message.thread_ts === undefined || message.thread_ts === message.ts);
}

export interface MessageRow {
  ref: string;
  from: string;
  at: string;
  ago: string;
  text: string;
  truncated?: true;
  replies?: number;
  thread?: string;
  in_thread?: string;
  reactions?: string;
  files?: string;
}

export function messageRow(dir: Directory, channel: string, message: SlackMessage, now = Date.now()): MessageRow {
  const ref = refOf(channel, message.ts);
  const source = `slack:${ref}`;
  const { text, truncated } = plainText(parseMrkdwn(message.text ?? ""), names(dir));
  const reactions = reactionsOf(dir, message);
  const root = isThreadRoot(message);
  const reply = message.thread_ts !== undefined && message.thread_ts !== message.ts;
  return {
    ref,
    from: authorOf(dir, message),
    at: tsDate(message.ts).toISOString(),
    ago: ago(message.ts, now),
    text: untrusted(source, text),
    ...(truncated ? { truncated: true as const } : {}),
    ...(root ? { replies: message.reply_count ?? 0, thread: ref } : {}),
    ...(reply && message.thread_ts ? { in_thread: refOf(channel, message.thread_ts) } : {}),
    ...(reactions ? { reactions } : {}),
    ...(message.files?.length ? { files: untrusted(source, message.files.map(fileLabel).join(", ")) } : {}),
  };
}

export function fileSize(bytes: number | undefined): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function previewText(dir: Directory, text: string | undefined): string {
  return plainText(parseMrkdwn(text ?? ""), names(dir), 140).text;
}
