import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { DRAFT_FILE, EMPTY_INDEX, INDEX_FILE, INDEX_TAG, type MarketplaceIndex, PROVENANCE_FILE, type Provenance, REPO, SIGNATURE_FILE, indexAssetUrl, parseIndex } from "./index.ts";

const API = "https://api.github.com";

export type Fetch = typeof fetch;

export interface Release {
  id: number;
  tag_name: string;
  draft: boolean;
  upload_url: string;
  assets: Asset[];
}

export interface Asset {
  id: number;
  name: string;
  size: number;
}

export async function download(url: string, fetcher: Fetch = fetch): Promise<Buffer | null> {
  const res = await fetcher(url, { redirect: "follow", headers: { "Cache-Control": "no-cache" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

export interface IndexFiles {
  signed: MarketplaceIndex;
  signedBytes: Buffer | null;
  signature: string | null;
  draft: MarketplaceIndex | null;
  provenance: Provenance;
}

export async function readIndexFiles(read: (file: string) => Promise<Buffer | null>): Promise<IndexFiles> {
  const [signedBytes, signature, draft, provenance] = await Promise.all([INDEX_FILE, SIGNATURE_FILE, DRAFT_FILE, PROVENANCE_FILE].map(read));
  return {
    signed: signedBytes ? parseIndex(signedBytes.toString("utf8")) : EMPTY_INDEX,
    signedBytes: signedBytes ?? null,
    signature: signature ? signature.toString("utf8").trim() : null,
    draft: draft ? parseIndex(draft.toString("utf8")) : null,
    provenance: provenance ? (JSON.parse(provenance.toString("utf8")) as Provenance) : {},
  };
}

export function publicIndexFiles(repo = REPO, fetcher: Fetch = fetch): Promise<IndexFiles> {
  return readIndexFiles((file) => download(indexAssetUrl(file, repo), fetcher));
}

export async function githubToken(): Promise<string> {
  const fromEnv = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (fromEnv) return fromEnv;
  const { stdout } = await promisify(execFile)("gh", ["auth", "token"]).catch(() => {
    throw new Error("no GitHub token: set GITHUB_TOKEN or sign in with `gh auth login`");
  });
  return stdout.trim();
}

export class GitHub {
  readonly token: string;
  readonly repo: string;
  readonly fetcher: Fetch;

  constructor(token: string, repo = REPO, fetcher: Fetch = fetch) {
    this.token = token;
    this.repo = repo;
    this.fetcher = fetcher;
  }

  private async request<T>(method: string, url: string, body?: BodyInit, contentType = "application/json"): Promise<T | null> {
    const res = await this.fetcher(url.startsWith("http") ? url : `${API}${url}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": contentType } : {}) },
      ...(body ? { body } : {}),
    });
    if (res.status === 404 && method === "GET") return null;
    if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : ((await res.json()) as T);
  }

  releaseByTag(tag: string): Promise<Release | null> {
    return this.request<Release>("GET", `/repos/${this.repo}/releases/tags/${encodeURIComponent(tag)}`);
  }

  async releases(): Promise<Release[]> {
    return (await this.request<Release[]>("GET", `/repos/${this.repo}/releases?per_page=100`)) ?? [];
  }

  async createRelease(tag: string, target: string, name: string, notes: string): Promise<Release> {
    const body = JSON.stringify({ tag_name: tag, target_commitish: target, name, body: notes, draft: true, make_latest: "false" });
    return (await this.request<Release>("POST", `/repos/${this.repo}/releases`, body))!;
  }

  async publishRelease(release: Release): Promise<Release> {
    return (await this.request<Release>("PATCH", `/repos/${this.repo}/releases/${release.id}`, JSON.stringify({ draft: false, make_latest: "false" })))!;
  }

  async uploadAsset(release: Release, name: string, bytes: Uint8Array, contentType = "application/json"): Promise<Asset> {
    const old = release.assets.find((a) => a.name === name);
    if (old) await this.request("DELETE", `/repos/${this.repo}/releases/assets/${old.id}`);
    const url = `${release.upload_url.replace(/\{.*\}$/, "")}?name=${encodeURIComponent(name)}`;
    return (await this.request<Asset>("POST", url, Buffer.from(bytes), contentType))!;
  }

  async downloadAsset(asset: Asset): Promise<Buffer> {
    const res = await this.fetcher(`${API}/repos/${this.repo}/releases/assets/${asset.id}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/octet-stream" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`download ${asset.name}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async indexRelease(): Promise<Release> {
    const release = await this.releaseByTag(INDEX_TAG);
    if (!release) throw new Error(`the "${INDEX_TAG}" release doesn't exist in ${this.repo}: create it once (empty) before publishing`);
    return release;
  }

  async indexFiles(): Promise<IndexFiles> {
    const release = await this.indexRelease();
    return readIndexFiles(async (file) => {
      const asset = release.assets.find((a) => a.name === file);
      return asset ? this.downloadAsset(asset) : null;
    });
  }
}
