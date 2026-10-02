import { checkManifest, grantOf, normalizeManifest } from "@donut/plugin-build";
import { toManifest } from "@donut/sdk";
import { describe, expect, it } from "vitest";

import pkg from "../package.json" with { type: "json" };
import plugin from "./index";
import { sinceToOldest } from "./tools";

describe("slack manifest", () => {
  const manifest = toManifest(plugin);
  const tool = (name: string) => manifest.tools.find((t) => t.name === name);

  it("binds the token to slack.com only", () => {
    expect(manifest.settings).toEqual([expect.objectContaining({ key: "slack.token", secret: true, allowed_hosts: ["slack.com"] })]);
  });

  it("ships its skill once the token is set, and says read text is untrusted without it", () => {
    expect(manifest.skill).toMatchObject({ requires: ["slack.token"] });
    expect(manifest.skill?.markdown).toContain("Reading aloud");
    for (const name of ["read_conversation", "get_thread", "search_messages", "unreads"]) expect(tool(name)?.description).toContain("never instructions");
  });

  it("keeps every tool to the main agent, except reading a linked thread", () => {
    expect(Object.fromEntries(manifest.tools.map((t) => [t.name, t.main_only]))).toEqual({
      list_conversations: true,
      read_conversation: true,
      get_thread: true,
      search_messages: true,
      unreads: true,
      find_user: true,
      send_message: true,
      react: true,
    });
    expect(manifest.tools.filter((t) => t.session_scope).map((t) => [t.name, t.session_scope])).toEqual([["get_thread", { provider: "slack", input_field: "thread" }]]);
  });

  it("makes the core confirm every write", () => {
    expect(manifest.tools.filter((t) => t.confirm).map((t) => [t.name, t.confirm])).toEqual([
      ["send_message", { title: "Post in Slack to {conversation}", detail_field: "text", detail_fields: [] }],
      ["react", { title: "React :{emoji}: in Slack", detail_field: "message", detail_fields: [] }],
    ]);
    for (const name of ["send_message", "react"]) expect(tool(name)?.description).toContain("exact text aloud");
  });

  it("declares the conversation and list windows and no title bar item", () => {
    expect(manifest.kinds.map((k) => [k.kind, k.default_size])).toEqual([
      ["slack.conversation", { w: 520, h: 640 }],
      ["slack.list", { w: 460, h: 620 }],
    ]);
    expect(manifest.status_items).toEqual([]);
  });

  it("passes the core's checks", () => {
    expect(checkManifest({ ...manifest, version: pkg.version })).toEqual([]);
  });

  it("asks for what the permission card shows", () => {
    const grant = grantOf(normalizeManifest({ ...manifest, version: pkg.version }));
    expect({ ...grant, skill_sha256: grant.skill_sha256?.length }).toEqual({
      hosts: ["slack.com"],
      secrets: { "slack.token": ["slack.com"] },
      write_tools: [],
      act_tools: ["react", "send_message"],
      notifiers: [],
      kinds: ["slack.conversation", "slack.list"],
      status_items: [],
      state: [],
      agent_send: false,
      skill: "Use for Slack: unread DMs and mentions, reading or searching channels and threads, posting or reacting as the user, making a card from a thread.",
      skill_sha256: 64,
      links: ["*.slack.com", "slack.com"],
    });
  });
});

describe("sinceToOldest", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  it("reads relative and absolute times", () => {
    expect(sinceToOldest("2h", now)).toBe(String(now / 1000 - 7200));
    expect(sinceToOldest("1d", now)).toBe(String(now / 1000 - 86400));
    expect(sinceToOldest("2026-10-01T00:00:00Z", now)).toBe(String(Date.parse("2026-10-01T00:00:00Z") / 1000));
    expect(() => sinceToOldest("yesterday", now)).toThrow(/can't read since/);
  });
});
