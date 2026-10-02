import { readManifest } from "@donut/plugin-build";

import { buildAll, folderProblems, listPlugins, manifestProblems } from "./lib/plugins.ts";

async function check(only: string[]): Promise<number> {
  let failed = 0;
  for (const plugin of (await listPlugins()).filter((p) => only.length === 0 || only.includes(p.id))) {
    const folder = await folderProblems(plugin);
    const problems = folder.length > 0 ? folder : manifestProblems(plugin, await readManifest(plugin.dir));
    for (const problem of problems) console.error(`✗ ${plugin.id}: ${problem}`);
    if (problems.length === 0) console.log(`✓ ${plugin.id}`);
    else failed++;
  }
  return failed === 0 ? 0 : 1;
}

async function build(only: string[]): Promise<number> {
  const results = await buildAll(undefined, only);
  for (const { plugin, built, error } of results) {
    if (!built) {
      console.error(`✗ ${plugin.id}: ${error}`);
      continue;
    }
    console.log(`✓ ${built.id} ${built.manifest.version} → ${built.path}\n  ${built.size} bytes, sha256 ${built.sha256}`);
    for (const warning of built.warnings) console.warn(`  ⚠ ${warning}`);
  }
  return results.every((r) => r.built) ? 0 : 1;
}

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
process.exit(await (args.includes("--check") ? check(only) : build(only)));
