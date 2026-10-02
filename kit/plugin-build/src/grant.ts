import { createHash } from "node:crypto";

import type { Grant, PermissionChange, PluginManifest, StateScope, ToolEffect, ToolInfo } from "@donut/protocol";

import { NOTIFIER_PREFIX, schemaFields, trimRust } from "./check.ts";

const STATE_ORDER: Record<StateScope, number> = { kanban_read: 0, canvas_read: 1 };

const byBytes = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const sorted = (values: string[]) => [...values].sort(byBytes);
const unique = <T>(values: T[]) => [...new Set(values)];

function normalizeTool(tool: ToolInfo, pluginName: string): ToolInfo {
  const normalized: ToolInfo = { ...tool, always_load: false };
  if (tool.notifier || tool.name.startsWith(NOTIFIER_PREFIX)) return { ...normalized, main_only: true };
  if (tool.effect === "read") return normalized;
  return {
    ...normalized,
    confirm: tool.confirm ?? { title: `${pluginName}: ${tool.name.replaceAll("_", " ")}`, detail_fields: sorted(schemaFields(tool.input_schema)) },
    main_only: tool.session_scope ? tool.main_only : true,
  };
}

export function normalizeManifest(manifest: PluginManifest): PluginManifest {
  const name = trimRust(manifest.name);
  return {
    ...manifest,
    name,
    permissions: {
      ...manifest.permissions,
      hosts: unique(sorted(manifest.permissions.hosts)),
      state: unique([...manifest.permissions.state].sort((a, b) => STATE_ORDER[a] - STATE_ORDER[b])),
      links: unique(sorted(manifest.permissions.links)),
    },
    tools: manifest.tools.map((tool) => normalizeTool(tool, name)),
    ...(manifest.skill ? { skill: { ...manifest.skill, description: trimRust(manifest.skill.description) } } : {}),
  };
}

export function grantOf(manifest: PluginManifest): Grant {
  const tools = (effect: ToolEffect) => sorted(manifest.tools.filter((t) => t.effect === effect && !t.notifier).map((t) => t.name));
  const secrets = manifest.settings.filter((s) => s.secret || s.kind === "secret").sort((a, b) => byBytes(a.key, b.key));
  const skill = manifest.skill && trimRust(manifest.skill.markdown) ? manifest.skill : null;
  return {
    hosts: manifest.permissions.hosts,
    secrets: Object.fromEntries(secrets.map((s) => [s.key, sorted(s.allowed_hosts ?? [])])),
    write_tools: tools("write"),
    act_tools: tools("act_as_user"),
    notifiers: sorted(manifest.tools.filter((t) => t.notifier).map((t) => t.name)),
    kinds: sorted(manifest.kinds.map((k) => k.kind)),
    status_items: sorted(manifest.status_items.map((s) => s.id)),
    state: manifest.permissions.state,
    agent_send: manifest.permissions.agent_send,
    skill: skill?.description ?? null,
    skill_sha256: skill ? createHash("sha256").update(`${skill.description}\n${skill.markdown}`).digest("hex") : null,
    links: manifest.permissions.links,
  };
}

export function diffGrant(old: Grant, next: Grant): PermissionChange[] {
  const added = <T>(values: T[], before: T[]) => values.filter((v) => !before.includes(v));
  const changes: PermissionChange[] = added(next.hosts, old.hosts).map((host) => ({ type: "host", host }));
  for (const [key, hosts] of Object.entries(next.secrets).sort(([a], [b]) => byBytes(a, b))) {
    const before = old.secrets[key];
    if (!before) changes.push({ type: "secret", key, hosts });
    else changes.push(...added(hosts, before).map((host): PermissionChange => ({ type: "secret_host", key, host })));
  }
  changes.push(...added(next.act_tools, old.act_tools).map((name): PermissionChange => ({ type: "tool", name, effect: "act_as_user" })));
  changes.push(...added(next.write_tools, [...old.write_tools, ...old.act_tools]).map((name): PermissionChange => ({ type: "tool", name, effect: "write" })));
  changes.push(...added(next.notifiers, old.notifiers).map((name): PermissionChange => ({ type: "notifier", name })));
  changes.push(...added(next.state, old.state).map((scope): PermissionChange => ({ type: "state", scope })));
  if (next.agent_send && !old.agent_send) changes.push({ type: "agent_send" });
  changes.push(...added(next.links, old.links).map((host): PermissionChange => ({ type: "link", host })));
  if (next.skill_sha256 !== null && next.skill_sha256 !== old.skill_sha256) changes.push({ type: "skill", description: next.skill ?? "" });
  changes.push(...added(next.kinds, old.kinds).map((kind): PermissionChange => ({ type: "kind", kind })));
  changes.push(...added(next.status_items, old.status_items).map((id): PermissionChange => ({ type: "status_item", id })));
  return changes;
}

export function needsApproval(changes: PermissionChange[]): boolean {
  return changes.some((c) => c.type !== "kind" && c.type !== "status_item");
}
