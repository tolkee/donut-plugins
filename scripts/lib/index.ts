import { createHash } from "node:crypto";

import type { Grant, MarketplaceEntry } from "@donut/protocol";

export const REPO = "tolkee/donut-plugins";
export const INDEX_TAG = "index";
export const INDEX_FILE = "index.json";
export const SIGNATURE_FILE = "index.json.sig";
export const DRAFT_FILE = "index.draft.json";
export const PROVENANCE_FILE = "provenance.json";

export interface MarketplaceIndex {
  sequence: number;
  plugins: MarketplaceEntry[];
}

export type Provenance = Record<string, string>;

export const EMPTY_INDEX: MarketplaceIndex = { sequence: 0, plugins: [] };

const ENTRY_KEYS = ["id", "name", "description", "version", "sha256", "size", "url", "published_at", "permissions", "min_donut", "yanked", "repo_path", "summary"] as const;
const GRANT_KEYS = ["hosts", "secrets", "write_tools", "act_tools", "notifiers", "kinds", "status_items", "state", "agent_send", "skill", "skill_sha256", "links"] as const;

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function tagOf(id: string, version: string): string {
  return `${id}-${version}`;
}

export function assetOf(id: string, version: string): string {
  return `${tagOf(id, version)}.json`;
}

export function releaseUrl(id: string, version: string, repo = REPO): string {
  return `https://github.com/${repo}/releases/download/${tagOf(id, version)}/${assetOf(id, version)}`;
}

export function indexAssetUrl(file: string, repo = REPO): string {
  return `https://github.com/${repo}/releases/download/${INDEX_TAG}/${file}`;
}

export function provenanceKey(id: string, version: string): string {
  return `${id}@${version}`;
}

export function sameRelease(entry: Pick<MarketplaceEntry, "id" | "version">, id: string, version: string): boolean {
  return entry.id === id && entry.version === version;
}

export function canonicalGrant(grant: Grant): Grant {
  const secrets = Object.fromEntries(Object.keys(grant.secrets).sort().map((key) => [key, grant.secrets[key]!]));
  return Object.fromEntries(GRANT_KEYS.map((key) => [key, key === "secrets" ? secrets : grant[key]])) as Grant;
}

export function canonicalEntry(entry: MarketplaceEntry): MarketplaceEntry {
  return Object.fromEntries(ENTRY_KEYS.map((key) => [key, key === "permissions" ? canonicalGrant(entry.permissions) : entry[key]])) as MarketplaceEntry;
}

export function serializeIndex(index: MarketplaceIndex): string {
  return `${JSON.stringify({ sequence: index.sequence, plugins: index.plugins.map(canonicalEntry) }, null, 2)}\n`;
}

export function parseIndex(text: string): MarketplaceIndex {
  const index = JSON.parse(text) as MarketplaceIndex;
  if (!Number.isSafeInteger(index.sequence) || index.sequence < 0 || !Array.isArray(index.plugins)) throw new Error("not a marketplace index: needs {sequence, plugins}");
  return index;
}

export function sameGrant(a: Grant, b: Grant): boolean {
  return JSON.stringify(canonicalGrant(a)) === JSON.stringify(canonicalGrant(b));
}

export function sameEntry(a: MarketplaceEntry, b: MarketplaceEntry): boolean {
  return JSON.stringify(canonicalEntry(a)) === JSON.stringify(canonicalEntry(b));
}

export interface NewRelease {
  id: string;
  name: string;
  description: string;
  version: string;
  sha256: string;
  size: number;
  grant: Grant;
}

export function newEntry(release: NewRelease, repo = REPO): MarketplaceEntry {
  return {
    id: release.id,
    name: release.name,
    description: release.description,
    version: release.version,
    sha256: release.sha256,
    size: release.size,
    url: releaseUrl(release.id, release.version, repo),
    published_at: 0,
    permissions: canonicalGrant(release.grant),
    min_donut: null,
    yanked: false,
    repo_path: `plugins/${release.id}`,
    summary: [],
  };
}

export function pendingDraft(signed: MarketplaceIndex, draft: MarketplaceIndex | null): MarketplaceIndex {
  const base = { sequence: signed.sequence + 1, plugins: signed.plugins.map((e) => ({ ...e })) };
  if (!draft || draft.sequence !== base.sequence) return base;
  const plugins = base.plugins.map((entry) => {
    const pending = draft.plugins.find((d) => sameRelease(d, entry.id, entry.version));
    return pending?.yanked ? { ...entry, yanked: true } : entry;
  });
  const added = draft.plugins.filter((d) => !signed.plugins.some((e) => sameRelease(e, d.id, d.version)));
  return { sequence: base.sequence, plugins: [...plugins, ...added] };
}

export function addEntries(draft: MarketplaceIndex, entries: MarketplaceEntry[]): MarketplaceIndex {
  for (const entry of entries) {
    if (draft.plugins.some((e) => sameRelease(e, entry.id, entry.version))) throw new Error(`${entry.id} ${entry.version} is already in the index`);
  }
  return { sequence: draft.sequence, plugins: [...draft.plugins, ...entries] };
}

export function yank(draft: MarketplaceIndex, id: string, version: string): MarketplaceIndex {
  if (!draft.plugins.some((e) => sameRelease(e, id, version))) throw new Error(`${id} ${version} is not in the index`);
  return { sequence: draft.sequence, plugins: draft.plugins.map((e) => (sameRelease(e, id, version) ? { ...e, yanked: true } : e)) };
}

export interface DraftChanges {
  added: MarketplaceEntry[];
  yanked: MarketplaceEntry[];
}

export function draftChanges(signed: MarketplaceIndex, draft: MarketplaceIndex): DraftChanges {
  if (draft.sequence <= signed.sequence) throw new Error(`the draft (sequence ${draft.sequence}) is not newer than the signed index (sequence ${signed.sequence}): nothing to sign`);
  const yanked: MarketplaceEntry[] = [];
  for (const entry of signed.plugins) {
    const next = draft.plugins.filter((d) => sameRelease(d, entry.id, entry.version));
    if (next.length !== 1) throw new Error(`${entry.id} ${entry.version} is in the signed index but ${next.length === 0 ? "missing from" : "repeated in"} the draft`);
    if (sameEntry(entry, next[0]!)) continue;
    if (!entry.yanked && next[0]!.yanked && sameEntry({ ...entry, yanked: true }, next[0]!)) yanked.push(next[0]!);
    else throw new Error(`${entry.id} ${entry.version} changed in the draft: only yanking a signed version is allowed`);
  }
  const added = draft.plugins.filter((d) => !signed.plugins.some((e) => sameRelease(e, d.id, d.version)));
  const keys = added.map((e) => provenanceKey(e.id, e.version));
  if (new Set(keys).size !== keys.length) throw new Error("the draft adds the same version twice");
  return { added, yanked };
}

export function latestOf(entries: MarketplaceEntry[], id: string): MarketplaceEntry | undefined {
  return entries.filter((e) => e.id === id).sort((a, b) => compareVersions(b.version, a.version))[0];
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function isVersion(version: string): boolean {
  return SEMVER.test(version);
}

function compareIdentifiers(a: string, b: string): number {
  const numeric = (s: string) => /^\d+$/.test(s);
  if (numeric(a) && numeric(b)) return BigInt(a) === BigInt(b) ? 0 : BigInt(a) < BigInt(b) ? -1 : 1;
  if (numeric(a)) return -1;
  if (numeric(b)) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareVersions(a: string, b: string): number {
  const ma = SEMVER.exec(a);
  const mb = SEMVER.exec(b);
  if (!ma || !mb) throw new Error(`not a semantic version: ${ma ? b : a}`);
  for (let i = 1; i <= 3; i++) {
    const order = compareIdentifiers(ma[i]!, mb[i]!);
    if (order !== 0) return order;
  }
  if (!ma[4] || !mb[4]) return ma[4] ? -1 : mb[4] ? 1 : 0;
  const pa = ma[4].split(".");
  const pb = mb[4].split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const order = compareIdentifiers(pa[i]!, pb[i]!);
    if (order !== 0) return order;
  }
  return 0;
}
