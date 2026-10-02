import type { Grant, PluginManifest } from "@donut/protocol";
import { describe, expect, it } from "vitest";

import { MARKER, protectedProblems, renderComment, review } from "./check-pr.ts";
import { entry, grant } from "./fixtures/entries.ts";
import type { BuildResult } from "./lib/plugins.ts";

function built(id: string, version: string, sha: string, g: Grant, warnings: string[] = []): BuildResult {
  const manifest = { id, version } as PluginManifest;
  return { plugin: { id, dir: `plugins/${id}` }, built: { id, path: "", sha256: sha, size: 10, bytes: Buffer.from(""), manifest, grant: g, warnings } };
}

const linearGrant = grant({ hosts: ["api.linear.app"], secrets: { "linear.token": ["api.linear.app"] }, write_tools: ["comment"], kinds: ["linear.issue"] });
const published = [entry("linear", "1.0.0", { sha256: "a".repeat(64), permissions: linearGrant })];

describe("protected paths", () => {
  it("lets the owner change the pipeline and nobody else", () => {
    const files = ["plugins/notes/src/index.tsx", "kit/sdk/src/index.ts", ".github/workflows/ci.yml", "scripts/publish.ts", "package.json", "plugins/notes/package.json"];
    expect(protectedProblems(files, "tolkee")).toEqual([]);
    expect(protectedProblems(files, "someone")).toEqual(["only @tolkee can change `kit/sdk/src/index.ts`, `.github/workflows/ci.yml`, `scripts/publish.ts`, `package.json`"]);
    expect(protectedProblems(["plugins/notes/package.json", "pnpm-lock.yaml"], "someone")).toEqual([]);
  });
});

describe("review", () => {
  it("ignores an unchanged published version", () => {
    const report = review([built("linear", "1.0.0", "a".repeat(64), linearGrant)], published, ["linear"]);
    expect(report).toEqual({ problems: [], plugins: [], removed: [] });
    expect(renderComment(report)).toBe(`${MARKER}\n## Plugin check\n\nNo plugin version changes.\n`);
  });

  it("fails a rebuild that changed without a bump", () => {
    const report = review([built("linear", "1.0.0", "b".repeat(64), linearGrant)], published, ["linear"]);
    expect(report.problems[0]).toMatch(/bump the version/);
    expect(renderComment(report)).toContain("- ✗ linear 1.0.0 is already published");
  });

  it("splits new permissions into approval and listed", () => {
    const next = { ...linearGrant, hosts: ["api.linear.app", "uploads.linear.app"], kinds: ["linear.issue", "linear.list"], links: ["linear.app"] };
    const report = review([built("linear", "1.1.0", "b".repeat(64), next, ["index.js calls eval("])], published, ["linear"]);
    expect(report.plugins[0]).toMatchObject({ from: "1.0.0", to: "1.1.0", diff: { approval: ["Reaches `https://uploads.linear.app`", "Opens links to `linear.app`"], listed: ["Window `linear.list`"] } });
    const comment = renderComment(report);
    expect(comment).toContain("### linear 1.0.0 → 1.1.0");
    expect(comment).toMatch(/\*\*Needs the user's approval\*\*\n\n- Reaches `https:\/\/uploads.linear.app`\n- Opens links to `linear.app`\n\n\*\*Listed\*\*\n\n- Window `linear.list`/);
    expect(comment).toContain("- ⚠ index.js calls eval(");
  });

  it("shows the full grant of a new plugin", () => {
    const report = review([built("notes", "0.1.0", "c".repeat(64), grant({ hosts: ["api.notes.dev"], act_tools: ["post"] }))], published, ["linear", "notes"]);
    expect(report.plugins[0]?.diff.approval).toEqual(["Reaches `https://api.notes.dev`", "Tool `post` acts as the user"]);
    expect(renderComment(report)).toContain("### notes 0.1.0 (new plugin)\n\n`cccc");
  });

  it("notes a plugin whose folder is gone", () => {
    expect(review([], published, []).removed).toEqual(["linear"]);
  });

  it("reports a build failure", () => {
    expect(review([{ plugin: { id: "notes", dir: "" }, error: "boom" }], published, ["linear", "notes"]).problems).toEqual(["notes: boom"]);
  });
});
