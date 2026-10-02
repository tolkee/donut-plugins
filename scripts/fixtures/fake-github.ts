import type { Asset, IndexFiles, Release } from "../lib/github.ts";
import { readIndexFiles } from "../lib/github.ts";
import { INDEX_TAG } from "../lib/index.ts";

export class FakeGitHub {
  readonly repo = "tolkee/donut-plugins";
  releases = new Map<string, Release>();
  files = new Map<number, Buffer>();
  log: string[] = [];
  private nextId = 1;

  constructor(withIndex = true) {
    if (withIndex) this.release(INDEX_TAG, false);
  }

  release(tag: string, draft: boolean): Release {
    const release: Release = { id: this.nextId++, tag_name: tag, draft, upload_url: `https://uploads/${tag}{?name,label}`, assets: [] };
    this.releases.set(tag, release);
    return release;
  }

  asset(tag: string, name: string): Buffer | undefined {
    const asset = this.releases.get(tag)?.assets.find((a) => a.name === name);
    return asset ? this.files.get(asset.id) : undefined;
  }

  put(tag: string, name: string, bytes: Buffer | string): void {
    const release = this.releases.get(tag) ?? this.release(tag, false);
    release.assets = release.assets.filter((a) => a.name !== name);
    const asset: Asset = { id: this.nextId++, name, size: bytes.length };
    this.files.set(asset.id, Buffer.from(bytes));
    release.assets.push(asset);
  }

  async releaseByTag(tag: string): Promise<Release | null> {
    const release = this.releases.get(tag);
    return release ? structuredClone(release) : null;
  }

  async indexRelease(): Promise<Release> {
    const release = await this.releaseByTag(INDEX_TAG);
    if (!release) throw new Error("no index release");
    return release;
  }

  async indexFiles(): Promise<IndexFiles> {
    await this.indexRelease();
    return readIndexFiles(async (file) => this.asset(INDEX_TAG, file) ?? null);
  }

  async createRelease(tag: string, target: string): Promise<Release> {
    this.log.push(`create ${tag} at ${target}`);
    return structuredClone(this.release(tag, true));
  }

  async publishRelease(release: Release): Promise<Release> {
    this.log.push(`publish ${release.tag_name}`);
    this.releases.get(release.tag_name)!.draft = false;
    return structuredClone(this.releases.get(release.tag_name)!);
  }

  async uploadAsset(release: Release, name: string, bytes: Uint8Array): Promise<Asset> {
    this.log.push(`upload ${release.tag_name}/${name}`);
    this.put(release.tag_name, name, Buffer.from(bytes));
    return this.releases.get(release.tag_name)!.assets.find((a) => a.name === name)!;
  }

  async downloadAsset(asset: Asset): Promise<Buffer> {
    return this.files.get(asset.id)!;
  }
}
