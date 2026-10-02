import type { PluginManifest, ToolInfo } from "@donut/protocol";

import reserved from "./reserved.json" with { type: "json" };

const ID = /^[a-z][a-z0-9-]{1,31}$/;
const LABEL = /^[a-z0-9-]{1,63}$/;
const NUMERIC_LABEL = /^(\d+|0x[0-9a-f]*)$/;
const SNAKE_CASE = /^[a-z][a-z0-9_]{0,63}$/;
const LOCAL_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.]+)?$/;
const U64_MAX = 2n ** 64n - 1n;
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal"];
const RUST_WHITESPACE = "\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const EDGE_WHITESPACE = new RegExp(`^[${RUST_WHITESPACE}]+|[${RUST_WHITESPACE}]+$`, "g");

export const MAX_TOOLS = 40;
const MAX_NOTIFIERS = 2;
export const NOTIFIER_PREFIX = "notify_";
const NOTIFIER_FIELDS = ["body", "priority", "title"];
export const MAX_SKILL_CHARS = 8000;
const MAX_DESCRIPTION_CHARS = 2000;
const MAX_SKILL_DESCRIPTION_CHARS = 300;
const MAX_NAME_CHARS = 60;

export function trimRust(text: string): string {
  return text.replace(EDGE_WHITESPACE, "");
}

function chars(text: string): number {
  return [...text].length;
}

function validVersion(version: string): boolean {
  const match = VERSION.exec(version);
  return match !== null && match.slice(1, 4).every((n) => BigInt(n ?? "") <= U64_MAX);
}

function validHost(host: string): boolean {
  const labels = host.split(".");
  if (host !== host.toLowerCase() || labels.length < 2 || !labels.every((l) => LABEL.test(l))) return false;
  if (NUMERIC_LABEL.test(labels.at(-1) ?? "")) return false;
  if (host === "localhost" || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) return false;
  try {
    return new URL(`https://${host}/`).hostname === host;
  } catch {
    return false;
  }
}

const duplicated = (values: string[]) => new Set(values).size !== values.length;

export function schemaFields(schema: unknown): string[] {
  const properties = typeof schema === "object" && schema !== null ? (schema as { properties?: unknown }).properties : undefined;
  return typeof properties === "object" && properties !== null && !Array.isArray(properties) ? Object.keys(properties) : [];
}

function notifierProblems(tool: ToolInfo): string[] {
  if (!tool.notifier || !tool.name.startsWith(NOTIFIER_PREFIX)) return [`tool "${tool.name}": notifiers, and only they, are named "${NOTIFIER_PREFIX}<name>"`];
  const problems: string[] = [];
  if (tool.effect !== "write") problems.push(`notifier "${tool.name}" sends data out: declare effect "write"`);
  if (tool.confirm || tool.session_scope) problems.push(`notifier "${tool.name}" is only run by Donut's own pings: it takes no confirm or session scope`);
  if (schemaFields(tool.input_schema).sort().join(",") !== NOTIFIER_FIELDS.join(",")) problems.push(`notifier "${tool.name}" must take exactly {title, body, priority}`);
  return problems;
}

export function checkManifest(manifest: PluginManifest): string[] {
  const problems: string[] = [];
  const { id } = manifest;
  const prefix = `${id}.`;
  const hosts = manifest.permissions.hosts;
  const ownName = (name: string) => name.startsWith(prefix) && LOCAL_NAME.test(name.slice(prefix.length));

  if (!ID.test(id)) problems.push(`plugin id "${id}" must be 2 to 32 lowercase letters, digits or dashes, starting with a letter`);
  if (reserved.ids.includes(id)) problems.push(`"${id}" is the id of a built-in part of Donut`);
  if (reserved.setting_prefixes.includes(id)) problems.push(`"${id}" is reserved for Donut's own settings`);
  const name = trimRust(manifest.name);
  if (!name || chars(name) > MAX_NAME_CHARS || name.includes("\n")) problems.push(`the plugin name must be one line of at most ${MAX_NAME_CHARS} characters`);
  if (!validVersion(manifest.version)) problems.push(`version "${manifest.version}" is not a semantic version like 1.2.3 (set it in package.json)`);
  if (chars(manifest.description) > MAX_DESCRIPTION_CHARS) problems.push(`the plugin description is longer than ${MAX_DESCRIPTION_CHARS} characters`);
  if (manifest.oauth.length > 0) problems.push("sandboxed plugins can't declare OAuth sign-in yet: use an API key setting");

  for (const host of hosts.filter((h) => !validHost(h))) {
    problems.push(`"${host}" is not a public host name (give exact hosts like api.example.com, no scheme, path or wildcard)`);
  }

  for (const link of manifest.permissions.links.filter((l) => !validHost(l.startsWith("*.") ? l.slice(2) : l))) {
    problems.push(`"${link}" is not a link host (give hosts like example.com or *.example.com, no scheme or path)`);
  }

  for (const setting of manifest.settings) {
    if (!setting.key.startsWith(prefix) || setting.key === prefix) problems.push(`setting "${setting.key}" must start with "${prefix}"`);
    if (setting.import_from) problems.push(`setting "${setting.key}" can't import tokens from other apps`);
    if (!setting.secret && setting.kind !== "secret") continue;
    const allowed = setting.allowed_hosts ?? [];
    if (allowed.length === 0) problems.push(`secret "${setting.key}" declares no allowed_hosts`);
    for (const host of allowed.filter((h) => !hosts.includes(h))) problems.push(`secret "${setting.key}" may go to ${host}, which is not in permissions.hosts`);
  }
  if (duplicated(manifest.settings.map((s) => s.key))) problems.push("a setting key is declared twice");

  for (const kind of manifest.kinds) {
    if (!ownName(kind.kind)) problems.push(`window kind "${kind.kind}" must be "${prefix}<name>"`);
    if (chars(kind.description) > MAX_DESCRIPTION_CHARS) problems.push(`the description of "${kind.kind}" is longer than ${MAX_DESCRIPTION_CHARS} characters`);
  }
  for (const item of manifest.status_items) {
    if (!ownName(item.id)) problems.push(`status item "${item.id}" must be "${prefix}<name>"`);
  }

  if (manifest.tools.length > MAX_TOOLS) problems.push(`a plugin can declare at most ${MAX_TOOLS} tools`);
  if (duplicated(manifest.tools.map((t) => t.name))) problems.push("a tool name is declared twice");
  if (manifest.tools.filter((t) => t.notifier).length > MAX_NOTIFIERS) problems.push(`a plugin can declare at most ${MAX_NOTIFIERS} notifiers`);
  for (const tool of manifest.tools) {
    if (!SNAKE_CASE.test(tool.name)) problems.push(`tool "${tool.name}" must be snake_case`);
    if (!trimRust(tool.description) || chars(tool.description) > MAX_DESCRIPTION_CHARS) {
      problems.push(`tool "${tool.name}" needs a description of at most ${MAX_DESCRIPTION_CHARS} characters`);
    }
    if (tool.session_scope && tool.session_scope.provider !== id) problems.push(`tool "${tool.name}" can only be scoped to its own "${id}" links`);
    if (tool.notifier || tool.name.startsWith(NOTIFIER_PREFIX)) {
      problems.push(...notifierProblems(tool));
      continue;
    }
    if (tool.confirm && tool.effect === "read") problems.push(`tool "${tool.name}" asks for a confirmation: declare its effect as "write" or "act_as_user"`);
  }

  const { skill } = manifest;
  if (skill) {
    const description = trimRust(skill.description);
    if (!description || description.includes("\n") || chars(description) > MAX_SKILL_DESCRIPTION_CHARS) {
      problems.push(`the skill description must be one line of at most ${MAX_SKILL_DESCRIPTION_CHARS} characters`);
    }
    if (chars(skill.markdown) > MAX_SKILL_CHARS) problems.push(`the skill is longer than ${MAX_SKILL_CHARS} characters`);
    if (!skill.requires.every((key) => key.startsWith(prefix))) problems.push(`a skill can only require the plugin's own "${prefix}" settings`);
  }
  return problems;
}
