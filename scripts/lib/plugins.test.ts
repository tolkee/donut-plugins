import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PluginManifest } from "@donut/protocol";
import { describe, expect, it } from "vitest";

import { entry } from "../fixtures/entries.ts";
import { bundleWarnings, folderProblems, listPlugins, manifestProblems, sizeProblems, versionProblems } from "./plugins.ts";

const published = [entry("linear", "1.0.0", { sha256: "a".repeat(64) }), entry("linear", "1.1.0", { sha256: "b".repeat(64) })];

function manifest(id: string): PluginManifest {
  return {
    id,
    name: "Linear",
    version: "1.0.0",
    description: "",
    permissions: { hosts: [], state: [], agent_send: false, links: [] },
    settings: [],
    kinds: [],
    tools: [],
    status_items: [],
    oauth: [],
  };
}

async function pluginFolder(id: string, files: Record<string, string>): Promise<{ id: string; dir: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "donut-plugins-"));
  const dir = join(root, "plugins", id);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  return { id, dir, root };
}

describe("folder rules", () => {
  it("accepts a well-formed folder", async () => {
    const plugin = await pluginFolder("notes", { "package.json": JSON.stringify({ name: "donut-plugin-notes", private: true, version: "1.0.0" }), "src/index.tsx": "", "src/SKILL.md": "" });
    expect(await folderProblems(plugin)).toEqual([]);
    expect(await listPlugins(plugin.root)).toEqual([{ id: "notes", dir: plugin.dir }]);
  });

  it("names every broken rule", async () => {
    const plugin = await pluginFolder("notes", { "package.json": JSON.stringify({ name: "@donut/plugin-notes", version: "1.0" }), "src/index.tsx": "" });
    expect(await folderProblems(plugin)).toEqual([
      'package.json "name" must be "donut-plugin-notes" (got "@donut/plugin-notes")',
      'package.json must set "private": true',
      'package.json "version" must be a semantic version like 1.2.3 (got "1.0")',
      "plugins/notes/src/SKILL.md is missing",
    ]);
  });

  it("requires the plugin id to equal the folder", () => {
    expect(manifestProblems({ id: "linear", dir: "" }, manifest("linear"))).toEqual([]);
    expect(manifestProblems({ id: "linear", dir: "" }, manifest("linear-two"))).toEqual(['the plugin id "linear-two" must equal its folder name "linear"']);
  });
});

describe("bundle rules", () => {
  it("caps the bundle at 5 MB", () => {
    expect(sizeProblems(5 * 1024 * 1024)).toEqual([]);
    expect(sizeProblems(5 * 1024 * 1024 + 1)).toEqual(["the bundle is 5.0 MB; the limit is 5 MB"]);
  });

  it("warns about eval without failing", () => {
    expect(bundleWarnings({ files: { "index.js": "const f = new Function('x')" } })).toHaveLength(1);
    expect(bundleWarnings({ files: { "index.js": "medieval(1)" } })).toEqual([]);
  });
});

describe("version rules", () => {
  it("accepts an unchanged published version and a bump", () => {
    expect(versionProblems({ id: "linear", version: "1.1.0", sha256: "b".repeat(64) }, published)).toEqual([]);
    expect(versionProblems({ id: "linear", version: "1.2.0", sha256: "c".repeat(64) }, published)).toEqual([]);
    expect(versionProblems({ id: "notes", version: "0.1.0", sha256: "c".repeat(64) }, published)).toEqual([]);
  });

  it("refuses a change without a bump", () => {
    expect(versionProblems({ id: "linear", version: "1.1.0", sha256: "c".repeat(64) }, published)[0]).toMatch(/already published with another build.*bump the version/);
  });

  it("refuses a downgrade", () => {
    expect(versionProblems({ id: "linear", version: "1.0.5", sha256: "c".repeat(64) }, published)).toEqual(["linear 1.0.5 must be greater than every published version (1.1.0)"]);
  });
});
