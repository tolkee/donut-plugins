import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";

import type { MarketplaceEntry } from "@donut/protocol";

import { publicIndexFiles } from "./lib/github.ts";
import { latestOf, pendingDraft } from "./lib/index.ts";
import { type PermissionDiff, permissionDiff, renderDiff } from "./lib/permissions.ts";
import { ROOT, type BuildResult, buildAll, isPublished, listPlugins, versionProblems } from "./lib/plugins.ts";

export const OWNER = "tolkee";
export const PROTECTED = ["kit/", ".github/", "scripts/", "package.json", "pnpm-workspace.yaml"];
export const MARKER = "<!-- donut-permissions -->";

export interface PluginReport {
  id: string;
  from: string | null;
  to: string;
  sha256: string;
  size: number;
  diff: PermissionDiff;
  warnings: string[];
}

export interface Report {
  problems: string[];
  plugins: PluginReport[];
  removed: string[];
}

export function protectedProblems(files: string[], author: string): string[] {
  if (author === OWNER) return [];
  const touched = files.filter((f) => PROTECTED.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p)));
  return touched.length === 0 ? [] : [`only @${OWNER} can change ${touched.map((f) => `\`${f}\``).join(", ")}`];
}

export function review(results: BuildResult[], published: MarketplaceEntry[], folders: string[]): Report {
  const report: Report = { problems: [], plugins: [], removed: [] };
  for (const { plugin, built, error } of results) {
    if (!built) {
      report.problems.push(`${plugin.id}: ${error}`);
      continue;
    }
    const version = built.manifest.version;
    report.problems.push(...versionProblems({ id: built.id, version, sha256: built.sha256 }, published));
    if (isPublished({ id: built.id, version }, published)) continue;
    const previous = latestOf(published, built.id);
    report.plugins.push({
      id: built.id,
      from: previous?.version ?? null,
      to: version,
      sha256: built.sha256,
      size: built.size,
      diff: permissionDiff(previous?.permissions ?? null, built.grant),
      warnings: built.warnings,
    });
  }
  report.removed = [...new Set(published.map((e) => e.id))].filter((id) => !folders.includes(id)).sort();
  return report;
}

export function renderComment(report: Report): string {
  const lines = [MARKER, "## Plugin check", ""];
  if (report.problems.length > 0) lines.push("**Problems**", "", ...report.problems.map((p) => `- ✗ ${p}`), "");
  if (report.plugins.length === 0 && report.problems.length === 0) lines.push("No plugin version changes.", "");
  for (const plugin of report.plugins) {
    lines.push(`### ${plugin.id} ${plugin.from ? `${plugin.from} → ${plugin.to}` : `${plugin.to} (new plugin)`}`, "");
    lines.push(`\`${plugin.sha256}\`, ${plugin.size} bytes`, "");
    if (!plugin.from) lines.push("Everything it asks for:", "");
    lines.push(renderDiff(plugin.diff), "");
    lines.push(...plugin.warnings.map((w) => `- ⚠ ${w}`));
    if (plugin.warnings.length > 0) lines.push("");
  }
  for (const id of report.removed) lines.push(`- \`${id}\` has no folder any more: its published versions stay in the index until yanked.`);
  return `${lines.join("\n").trim()}\n`;
}

async function changedFiles(base: string): Promise<string[]> {
  const { stdout } = await promisify(execFile)("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: ROOT });
  return stdout.split("\n").filter(Boolean);
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { base: { type: "string", default: "origin/main" }, out: { type: "string", default: join(ROOT, "comment.md") } } });
  const author = process.env.PR_AUTHOR ?? "";
  const problems = protectedProblems(await changedFiles(values.base), author);
  const { signed, draft } = await publicIndexFiles();
  const published = pendingDraft(signed, draft).plugins;
  const folders = (await listPlugins()).map((p) => p.id);
  const report = review(await buildAll(), published, folders);
  report.problems.unshift(...problems);
  const comment = renderComment(report);
  await writeFile(values.out, comment);
  if (process.env.PR_NUMBER) await writeFile(join(ROOT, "pr-number.txt"), `${process.env.PR_NUMBER}\n`);
  console.log(comment);
  return report.problems.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(await main());
