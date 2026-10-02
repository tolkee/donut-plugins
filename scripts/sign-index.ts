import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";

import { checkManifest, grantOf, normalizeManifest } from "@donut/plugin-build";
import type { MarketplaceEntry, PluginManifest } from "@donut/protocol";

import { GitHub, download, githubToken } from "./lib/github.ts";
import { IMAGE } from "./lib/image.ts";
import {
  INDEX_FILE,
  type MarketplaceIndex,
  SIGNATURE_FILE,
  draftChanges,
  latestOf,
  provenanceKey,
  releaseUrl,
  sameGrant,
  serializeIndex,
  sha256,
} from "./lib/index.ts";
import { permissionDiff, renderDiff } from "./lib/permissions.ts";
import { ROOT } from "./lib/plugins.ts";
import { KEYCHAIN_SERVICE, privateKeyFromPkcs8, rawPublicKey, signBytes, verifyBytes } from "./lib/sign.ts";

const run = promisify(execFile);

export function verifyEntry(entry: MarketplaceEntry, asset: Buffer, rebuilt: Buffer, repo: string): string[] {
  const at = `${entry.id} ${entry.version}`;
  const problems: string[] = [];
  if (sha256(asset) !== entry.sha256) problems.push(`${at}: the released asset's sha256 is ${sha256(asset)}, the draft says ${entry.sha256}`);
  if (sha256(rebuilt) !== entry.sha256) problems.push(`${at}: the local rebuild's sha256 is ${sha256(rebuilt)}, the draft says ${entry.sha256}`);
  if (asset.length !== entry.size) problems.push(`${at}: the asset is ${asset.length} bytes, the draft says ${entry.size}`);
  if (entry.url !== releaseUrl(entry.id, entry.version, repo)) problems.push(`${at}: unexpected url ${entry.url}`);
  if (entry.repo_path !== `plugins/${entry.id}`) problems.push(`${at}: unexpected repo_path ${entry.repo_path}`);
  if (entry.published_at !== 0 || entry.yanked || entry.min_donut !== null || entry.summary.length > 0) problems.push(`${at}: a new entry must have published_at 0, no yank, no min_donut and an empty summary`);
  let manifest: PluginManifest;
  try {
    manifest = (JSON.parse(asset.toString("utf8")) as { manifest: PluginManifest }).manifest;
  } catch {
    return [...problems, `${at}: the asset is not a plugin bundle`];
  }
  if (manifest.id !== entry.id || manifest.version !== entry.version) problems.push(`${at}: the bundle is ${manifest.id} ${manifest.version}`);
  if (manifest.name !== entry.name || manifest.description !== entry.description) problems.push(`${at}: the name or description differs from the bundle's`);
  problems.push(...checkManifest(manifest).map((p) => `${at}: ${p}`));
  if (!sameGrant(grantOf(normalizeManifest(manifest)), entry.permissions)) problems.push(`${at}: the draft's permissions are not the bundle's grant`);
  return problems;
}

export interface Signing {
  index: MarketplaceIndex;
  added: MarketplaceEntry[];
  yanked: MarketplaceEntry[];
}

export function prepare(signed: MarketplaceIndex, draft: MarketplaceIndex | null, now: number): Signing {
  if (!draft) throw new Error("there is no draft index: nothing to sign");
  const { added, yanked } = draftChanges(signed, draft);
  if (added.length === 0 && yanked.length === 0) throw new Error("the draft changes nothing");
  const isAdded = (e: MarketplaceEntry) => added.some((a) => a.id === e.id && a.version === e.version);
  const index = { sequence: draft.sequence, plugins: draft.plugins.map((e) => (isAdded(e) ? { ...e, published_at: now } : e)) };
  return { index, added: index.plugins.filter(isAdded), yanked };
}

export function summary(signing: Signing, signed: MarketplaceIndex): string {
  const lines: string[] = [`Index sequence ${signed.sequence} → ${signing.index.sequence}`, ""];
  for (const entry of signing.added) {
    const previous = latestOf(signed.plugins, entry.id);
    lines.push(`+ ${entry.id} ${previous ? `${previous.version} → ` : ""}${entry.version}${previous ? "" : " (new plugin)"}`);
    lines.push(...renderDiff(permissionDiff(previous?.permissions ?? null, entry.permissions)).split("\n").map((l) => `    ${l}`), "");
  }
  for (const entry of signing.yanked) lines.push(`- yank ${entry.id} ${entry.version}`);
  return lines.join("\n").trimEnd();
}

async function sh(command: string, args: string[], cwd = ROOT): Promise<string> {
  return (await run(command, args, { cwd, maxBuffer: 64 * 1024 * 1024 })).stdout.trim();
}

function stream(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.slice(0, 3).join(" ")}… exited with ${code}`))));
  });
}

async function preflight(): Promise<void> {
  if (process.platform !== "darwin") throw new Error("sign-index reads the key from the macOS Keychain");
  if ((await sh("git", ["status", "--porcelain"])) !== "") throw new Error("the checkout has local changes: sign from a clean main");
  if ((await sh("git", ["rev-parse", "--abbrev-ref", "HEAD"])) !== "main") throw new Error("check out main first");
  await sh("git", ["fetch", "--quiet", "origin", "main"]);
  if ((await sh("git", ["rev-parse", "HEAD"])) !== (await sh("git", ["rev-parse", "origin/main"]))) throw new Error("main is not at origin/main: pull first");
  await sh("docker", ["info", "--format", "{{.ServerVersion}}"]).catch(() => {
    throw new Error("Docker (or OrbStack) must be running: the rebuild runs plugin code in a container, away from the Keychain");
  });
}

async function rebuild(commit: string, ids: string[]): Promise<Map<string, Buffer>> {
  const tree = join(ROOT, ".sign", commit);
  await rm(tree, { recursive: true, force: true });
  await sh("git", ["worktree", "prune"]);
  await mkdir(join(ROOT, ".sign"), { recursive: true });
  await sh("git", ["worktree", "add", "--detach", tree, commit]);
  const mount = ["-v", `${tree}:/w`, "-w", "/w"];
  try {
    await stream("docker", ["run", "--rm", ...mount, "-e", "COREPACK_ENABLE_DOWNLOAD_PROMPT=0", IMAGE, "sh", "-c", "corepack enable && pnpm install --frozen-lockfile --ignore-scripts"]);
    const out = new Map<string, Buffer>();
    for (const id of ids) {
      await stream("docker", ["run", "--rm", "--network", "none", ...mount, IMAGE, "node", "kit/plugin-build/src/cli.ts", "build", `plugins/${id}`, "--out", `.rebuild/${id}`]);
      out.set(id, await readFile(join(tree, ".rebuild", id, "donut-plugin.json")));
    }
    return out;
  } finally {
    await sh("git", ["worktree", "remove", "--force", tree]).catch(() => rm(tree, { recursive: true, force: true }));
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

async function main(): Promise<number> {
  await preflight();
  const gh = new GitHub(await githubToken());
  const files = await gh.indexFiles();
  const signing = prepare(files.signed, files.draft, 0);

  const problems: string[] = [];
  const byCommit = new Map<string, MarketplaceEntry[]>();
  for (const entry of signing.added) {
    const commit = files.provenance[provenanceKey(entry.id, entry.version)];
    if (!commit || !/^[0-9a-f]{40}$/.test(commit)) problems.push(`${entry.id} ${entry.version} has no provenance commit`);
    else byCommit.set(commit, [...(byCommit.get(commit) ?? []), entry]);
  }
  for (const [commit, entries] of byCommit) {
    console.log(`\nRebuilding ${entries.map((e) => `${e.id} ${e.version}`).join(", ")} at ${commit.slice(0, 12)} in ${IMAGE.split("@")[0]}…`);
    const rebuilt = await rebuild(commit, entries.map((e) => e.id));
    for (const entry of entries) {
      const asset = await download(entry.url);
      if (!asset) problems.push(`${entry.id} ${entry.version}: ${entry.url} is missing`);
      else problems.push(...verifyEntry(entry, asset, rebuilt.get(entry.id)!, gh.repo));
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✗ ${problem}`);
    return 1;
  }

  console.log(`\n${summary(signing, files.signed)}\n`);
  if (!(await confirm("Sign and publish this index? [y/N] "))) return 1;

  const final = prepare(files.signed, files.draft, Date.now());
  const bytes = Buffer.from(serializeIndex(final.index));
  console.log("Reading the signing key from the Keychain (macOS asks first)…");
  const key = privateKeyFromPkcs8(await sh("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"]));
  const publicKey = rawPublicKey(key);
  console.log(`Public key ${publicKey}`);
  if (files.signedBytes && !(files.signature && verifyBytes(files.signedBytes, files.signature, publicKey))) {
    throw new Error("the current index.json is not signed by this key: refusing to sign over it");
  }
  const signature = signBytes(bytes, key);
  if (!verifyBytes(bytes, signature, publicKey)) throw new Error("the new signature doesn't verify");

  const release = await gh.indexRelease();
  await gh.uploadAsset(release, INDEX_FILE, bytes);
  await gh.uploadAsset(await gh.indexRelease(), SIGNATURE_FILE, Buffer.from(signature), "text/plain");

  const check = await gh.indexFiles();
  if (!check.signedBytes?.equals(bytes) || !check.signature || !verifyBytes(check.signedBytes, check.signature, publicKey)) {
    throw new Error("the uploaded index.json or index.json.sig doesn't verify: check the index release by hand");
  }
  console.log(`✓ signed and uploaded index.json (sequence ${final.index.sequence})`);
  return 0;
}

if (import.meta.main) process.exit(await main());
