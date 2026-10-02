import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { type Built, MAX_BUNDLE_BYTES, buildPlugin, checkManifest } from "@donut/plugin-build";
import type { MarketplaceEntry, PluginManifest } from "@donut/protocol";

import { compareVersions, isVersion, sha256 } from "./index.ts";

export const ROOT = resolve(import.meta.dirname, "..", "..");
export const PLUGINS_DIR = "plugins";
export const DIST_DIR = "dist";
export const REQUIRED_FILES = ["src/index.tsx", "src/SKILL.md"];
const EVAL = /\beval\(|new Function\(/;

export interface PluginFolder {
  id: string;
  dir: string;
}

export interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
}

export interface BuiltPlugin extends Built {
  id: string;
  bytes: Buffer;
  warnings: string[];
}

export async function listPlugins(root = ROOT): Promise<PluginFolder[]> {
  const entries = await readdir(join(root, PLUGINS_DIR), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => ({ id: e.name, dir: join(root, PLUGINS_DIR, e.name) }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export async function readPackage(dir: string): Promise<PackageJson> {
  return JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as PackageJson;
}

const exists = (path: string) => stat(path).then(() => true, () => false);

export async function folderProblems(plugin: PluginFolder): Promise<string[]> {
  const problems: string[] = [];
  const pkg = await readPackage(plugin.dir).catch(() => null);
  if (!pkg) return [`plugins/${plugin.id} has no readable package.json`];
  if (pkg.name !== `donut-plugin-${plugin.id}`) problems.push(`package.json "name" must be "donut-plugin-${plugin.id}" (got ${JSON.stringify(pkg.name)})`);
  if (pkg.private !== true) problems.push(`package.json must set "private": true`);
  if (typeof pkg.version !== "string" || !isVersion(pkg.version)) problems.push(`package.json "version" must be a semantic version like 1.2.3 (got ${JSON.stringify(pkg.version)})`);
  for (const file of REQUIRED_FILES) {
    if (!(await exists(join(plugin.dir, file)))) problems.push(`plugins/${plugin.id}/${file} is missing`);
  }
  return problems;
}

export function manifestProblems(plugin: PluginFolder, manifest: PluginManifest): string[] {
  const problems = manifest.id === plugin.id ? [] : [`the plugin id "${manifest.id}" must equal its folder name "${plugin.id}"`];
  return [...problems, ...checkManifest(manifest)];
}

export function bundleWarnings(bundle: { files: Record<string, string> }): string[] {
  return EVAL.test(bundle.files["index.js"] ?? "") ? ["index.js calls eval( or new Function(: reviewers, check why"] : [];
}

export function sizeProblems(size: number): string[] {
  return size > MAX_BUNDLE_BYTES ? [`the bundle is ${(size / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB`] : [];
}

export function versionProblems(built: { id: string; version: string; sha256: string }, published: MarketplaceEntry[]): string[] {
  const same = published.find((e) => e.id === built.id && e.version === built.version);
  if (same) {
    return same.sha256 === built.sha256 ? [] : [`${built.id} ${built.version} is already published with another build (sha256 ${same.sha256}, now ${built.sha256}): bump the version in package.json`];
  }
  const higher = published.filter((e) => e.id === built.id && compareVersions(e.version, built.version) >= 0).map((e) => e.version);
  return higher.length === 0 ? [] : [`${built.id} ${built.version} must be greater than every published version (${higher.join(", ")})`];
}

export function isPublished(built: { id: string; version: string }, published: MarketplaceEntry[]): boolean {
  return published.some((e) => e.id === built.id && e.version === built.version);
}

export function distOf(id: string, root = ROOT): string {
  return join(root, DIST_DIR, id);
}

export async function buildOne(plugin: PluginFolder, root = ROOT): Promise<BuiltPlugin> {
  const problems = await folderProblems(plugin);
  if (problems.length > 0) throw new Error(`${plugin.id}: ${problems.join("; ")}`);
  const built = await buildPlugin(plugin.dir, distOf(plugin.id, root));
  const bytes = await readFile(built.path);
  if (sha256(bytes) !== built.sha256) throw new Error(`${plugin.id}: the bundle changed on disk while building`);
  const problemsAfter = manifestProblems(plugin, built.manifest);
  if (problemsAfter.length > 0) throw new Error(`${plugin.id}: ${problemsAfter.join("; ")}`);
  return { ...built, id: plugin.id, bytes, warnings: bundleWarnings(JSON.parse(bytes.toString("utf8")) as { files: Record<string, string> }) };
}

export interface BuildResult {
  plugin: PluginFolder;
  built?: BuiltPlugin;
  error?: string;
}

export async function buildAll(root = ROOT, only: string[] = []): Promise<BuildResult[]> {
  const plugins = (await listPlugins(root)).filter((p) => only.length === 0 || only.includes(p.id));
  const unknown = only.filter((id) => !plugins.some((p) => p.id === id));
  if (unknown.length > 0) throw new Error(`no plugin folder plugins/${unknown.join(", plugins/")}`);
  const results: BuildResult[] = [];
  for (const plugin of plugins) {
    try {
      results.push({ plugin, built: await buildOne(plugin, root) });
    } catch (error) {
      results.push({ plugin, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
