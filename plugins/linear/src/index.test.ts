import { checkManifest, grantOf, normalizeManifest } from "@donut/plugin-build";
import { toManifest } from "@donut/sdk";
import { describe, expect, it } from "vitest";

import pkg from "../package.json" with { type: "json" };
import plugin from "./index";

describe("linear manifest", () => {
  const manifest = toManifest(plugin);

  it("binds the API key to api.linear.app", () => {
    const token = manifest.settings.find((s) => s.key === "linear.token");
    expect(token).toMatchObject({ secret: true, allowed_hosts: ["api.linear.app"] });
  });

  it("keeps writes to the main agent", () => {
    const tools = Object.fromEntries(manifest.tools.map((t) => [t.name, t.main_only]));
    expect(tools).toEqual({
      list_teams: false,
      search_issues: false,
      my_issues: false,
      get_issue: false,
      list_projects: false,
      get_project: false,
      create_issue: true,
      update_issue: true,
      comment: true,
    });
    expect(manifest.tools.find((t) => t.name === "comment")?.session_scope).toEqual({ provider: "linear", input_field: "id" });
    expect(manifest.tools.find((t) => t.name === "create_issue")?.session_scope).toBeUndefined();
    for (const name of ["create_issue", "update_issue", "comment"]) {
      expect(manifest.tools.find((t) => t.name === name)?.description).toContain("holds the call until the user confirms");
    }
  });

  it("holds every write for the user's confirmation", () => {
    const confirm = Object.fromEntries(manifest.tools.map((t) => [t.name, t.confirm]));
    expect(confirm.create_issue).toMatchObject({ title: "Create a Linear issue in {team}", detail_fields: expect.arrayContaining(["title", "description"]) });
    expect(confirm.update_issue).toMatchObject({ title: "Change {id} in Linear", detail_fields: expect.arrayContaining(["state", "assignee"]) });
    expect(confirm.comment).toEqual({ title: "Comment on {id} in Linear", detail_field: "body", detail_fields: [] });
    for (const name of ["list_teams", "search_issues", "my_issues", "get_issue", "list_projects", "get_project"]) expect(confirm[name]).toBeUndefined();
  });

  it("ships its skill once the API key is set", () => {
    expect(manifest.skill).toMatchObject({ requires: ["linear.token"] });
    expect(manifest.skill?.markdown).toContain("kanban_link_card");
  });

  it("declares the issue and list windows and a disabled title bar item", () => {
    expect(manifest.kinds.map((k) => [k.kind, k.default_size])).toEqual([
      ["linear.issue", { w: 560, h: 680 }],
      ["linear.list", { w: 480, h: 640 }],
    ]);
    expect(manifest.status_items).toMatchObject([{ id: "linear.mine", default_enabled: false }]);
    expect(manifest.settings.find((s) => s.key === "linear.mine_scope")).toMatchObject({ kind: "select", default: "open" });
  });

  it("passes the core's checks", () => {
    expect(checkManifest({ ...manifest, version: pkg.version })).toEqual([]);
  });

  it("asks for what the permission card shows", () => {
    const grant = grantOf(normalizeManifest({ ...manifest, version: pkg.version }));
    expect({ ...grant, skill_sha256: grant.skill_sha256?.length }).toEqual({
      hosts: ["api.linear.app"],
      secrets: { "linear.token": ["api.linear.app"] },
      write_tools: ["comment", "create_issue", "update_issue"],
      act_tools: [],
      notifiers: [],
      kinds: ["linear.issue", "linear.list"],
      status_items: ["linear.mine"],
      state: ["kanban_read"],
      agent_send: false,
      skill: "Use for Linear: the user's issues, searching issues and projects, creating or changing issues, commenting, linking issues to cards.",
      skill_sha256: 64,
      links: ["linear.app"],
    });
  });
});
