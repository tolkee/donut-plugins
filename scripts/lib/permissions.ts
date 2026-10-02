import { diffGrant, needsApproval } from "@donut/plugin-build";
import type { Grant, PermissionChange } from "@donut/protocol";

export const EMPTY_GRANT: Grant = {
  hosts: [],
  secrets: {},
  write_tools: [],
  act_tools: [],
  notifiers: [],
  kinds: [],
  status_items: [],
  state: [],
  agent_send: false,
  skill: null,
  skill_sha256: null,
  links: [],
};

const STATE: Record<string, string> = { kanban_read: "Reads the kanban boards", canvas_read: "Sees the titles of other windows" };

export function describeChange(change: PermissionChange): string {
  switch (change.type) {
    case "host":
      return `Reaches \`https://${change.host}\``;
    case "secret":
      return `Secret \`${change.key}\`, sent only to ${change.hosts.map((h) => `\`${h}\``).join(", ") || "no host"}`;
    case "secret_host":
      return `Secret \`${change.key}\` may also go to \`${change.host}\``;
    case "tool":
      return change.effect === "act_as_user" ? `Tool \`${change.name}\` acts as the user` : `Tool \`${change.name}\` changes data`;
    case "notifier":
      return `Notifier \`${change.name}\` delivers Donut's phone pings`;
    case "state":
      return STATE[change.scope] ?? `State \`${change.scope}\``;
    case "agent_send":
      return "Sends text to Donut's agent";
    case "link":
      return `Opens links to \`${change.host}\``;
    case "skill":
      return `Skill, new or changed: “${change.description}”`;
    case "kind":
      return `Window \`${change.kind}\``;
    case "status_item":
      return `Title bar item \`${change.id}\``;
  }
}

export interface PermissionDiff {
  approval: string[];
  listed: string[];
}

export function permissionDiff(previous: Grant | null, next: Grant): PermissionDiff {
  const changes = diffGrant(previous ?? EMPTY_GRANT, next);
  return {
    approval: changes.filter((c) => needsApproval([c])).map(describeChange),
    listed: changes.filter((c) => !needsApproval([c])).map(describeChange),
  };
}

export function renderDiff(diff: PermissionDiff): string {
  if (diff.approval.length === 0 && diff.listed.length === 0) return "No new permissions.";
  const section = (title: string, lines: string[]) => (lines.length === 0 ? [] : [`**${title}**`, "", ...lines.map((l) => `- ${l}`), ""]);
  return [...section("Needs the user's approval", diff.approval), ...section("Listed", diff.listed)].join("\n").trim();
}
