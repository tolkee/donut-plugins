import type { MarketplaceEntry } from "@donut/protocol";

import { type Asset, GitHub, type Release, githubToken } from "./lib/github.ts";
import { DRAFT_FILE, PROVENANCE_FILE, type Provenance, REPO, addEntries, assetOf, newEntry, pendingDraft, provenanceKey, serializeIndex, sha256, tagOf } from "./lib/index.ts";
import { permissionDiff, renderDiff } from "./lib/permissions.ts";
import { type BuildResult, type BuiltPlugin, buildAll, isPublished, versionProblems } from "./lib/plugins.ts";

export type Releases = Pick<GitHub, "repo" | "indexFiles" | "indexRelease" | "releaseByTag" | "createRelease" | "uploadAsset" | "publishRelease" | "downloadAsset">;

export interface Published {
  entries: MarketplaceEntry[];
  draft: string | null;
}

export function releaseNotes(built: BuiltPlugin, commit: string): string {
  return [
    `Built from ${commit}.`,
    "",
    `\`${assetOf(built.id, built.manifest.version)}\`: ${built.size} bytes, sha256 \`${built.sha256}\``,
    "",
    "Permissions:",
    "",
    renderDiff(permissionDiff(null, built.grant)),
    "",
    "Listed in the marketplace once the index is signed.",
  ].join("\n");
}

async function releaseVersion(gh: Releases, built: BuiltPlugin, commit: string): Promise<void> {
  const version = built.manifest.version;
  const tag = tagOf(built.id, version);
  const name = assetOf(built.id, version);
  let release: Release | null = await gh.releaseByTag(tag);
  const existing: Asset | undefined = release?.assets.find((a) => a.name === name);
  if (release && existing) {
    const bytes = await gh.downloadAsset(existing);
    if (sha256(bytes) !== built.sha256) throw new Error(`release ${tag} already holds a different ${name} (sha256 ${sha256(bytes)}, built ${built.sha256})`);
    console.log(`${tag}: already released`);
  } else {
    release ??= await gh.createRelease(tag, commit, `${built.manifest.name} ${version}`, releaseNotes(built, commit));
    await gh.uploadAsset(release, name, built.bytes);
    console.log(`${tag}: uploaded ${name}`);
  }
  if (release.draft) await gh.publishRelease(release);
}

export async function publish(gh: Releases, results: BuildResult[], commit: string): Promise<Published> {
  const failed = results.filter((r) => !r.built);
  if (failed.length > 0) throw new Error(failed.map((r) => `${r.plugin.id}: ${r.error}`).join("\n"));
  const files = await gh.indexFiles();
  const draft = pendingDraft(files.signed, files.draft);
  const builds = results.map((r) => r.built!);
  const problems = builds.flatMap((b) => versionProblems({ id: b.id, version: b.manifest.version, sha256: b.sha256 }, draft.plugins));
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const fresh = builds.filter((b) => !isPublished({ id: b.id, version: b.manifest.version }, draft.plugins));
  if (fresh.length === 0) return { entries: [], draft: null };

  const provenance: Provenance = { ...files.provenance };
  const entries: MarketplaceEntry[] = [];
  for (const built of fresh) {
    await releaseVersion(gh, built, commit);
    const { id, name, description, version } = built.manifest;
    entries.push(newEntry({ id, name, description, version, sha256: built.sha256, size: built.size, grant: built.grant }, gh.repo));
    provenance[provenanceKey(id, version)] = commit;
  }

  const next = serializeIndex(addEntries(draft, entries));
  const sorted = Object.fromEntries(Object.entries(provenance).sort(([a], [b]) => (a < b ? -1 : 1)));
  const index = await gh.indexRelease();
  await gh.uploadAsset(index, DRAFT_FILE, Buffer.from(next));
  await gh.uploadAsset(index, PROVENANCE_FILE, Buffer.from(`${JSON.stringify(sorted, null, 2)}\n`));
  return { entries, draft: next };
}

async function main(): Promise<number> {
  const commit = process.env.GITHUB_SHA;
  if (!commit) throw new Error("GITHUB_SHA is not set: publish runs on GitHub Actions after a merge to main");
  const gh = new GitHub(await githubToken(), process.env.GITHUB_REPOSITORY ?? REPO);
  const { entries } = await publish(gh, await buildAll(), commit);
  console.log(entries.length === 0 ? "nothing new to publish" : `draft updated with ${entries.map((e) => `${e.id} ${e.version}`).join(", ")}: run pnpm sign-index`);
  return 0;
}

if (import.meta.main) process.exit(await main());
