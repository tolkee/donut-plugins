import type { Grant, PluginManifest } from "@donut/protocol";
import { describe, expect, it } from "vitest";

import { grant } from "./fixtures/entries.ts";
import { FakeGitHub } from "./fixtures/fake-github.ts";
import { DRAFT_FILE, INDEX_FILE, INDEX_TAG, PROVENANCE_FILE, type MarketplaceIndex, parseIndex, serializeIndex, sha256 } from "./lib/index.ts";
import type { BuildResult } from "./lib/plugins.ts";
import { publish } from "./publish.ts";

function built(id: string, version: string, body = `${id}@${version}`, g: Grant = grant({ hosts: [`api.${id}.app`] })): BuildResult {
  const bytes = Buffer.from(body);
  const manifest = { id, version, name: id[0]!.toUpperCase() + id.slice(1), description: `${id} plugin` } as PluginManifest;
  return { plugin: { id, dir: "" }, built: { id, path: "", bytes, sha256: sha256(bytes), size: bytes.length, manifest, grant: g, warnings: [] } };
}

function draftOf(gh: FakeGitHub): MarketplaceIndex {
  return parseIndex(gh.asset(INDEX_TAG, DRAFT_FILE)!.toString("utf8"));
}

describe("publish", () => {
  it("releases each new version once and writes the unsigned draft", async () => {
    const gh = new FakeGitHub();
    await publish(gh, [built("linear", "1.0.0"), built("slack", "1.0.0")], "abc123");
    expect(gh.log).toEqual([
      "create linear-1.0.0 at abc123",
      "upload linear-1.0.0/linear-1.0.0.json",
      "publish linear-1.0.0",
      "create slack-1.0.0 at abc123",
      "upload slack-1.0.0/slack-1.0.0.json",
      "publish slack-1.0.0",
      "upload index/index.draft.json",
      "upload index/provenance.json",
    ]);
    const draft = draftOf(gh);
    expect(draft.sequence).toBe(1);
    expect(draft.plugins[0]).toMatchObject({ id: "linear", name: "Linear", version: "1.0.0", published_at: 0, url: "https://github.com/tolkee/donut-plugins/releases/download/linear-1.0.0/linear-1.0.0.json", permissions: { hosts: ["api.linear.app"] } });
    expect(JSON.parse(gh.asset(INDEX_TAG, PROVENANCE_FILE)!.toString())).toEqual({ "linear@1.0.0": "abc123", "slack@1.0.0": "abc123" });
    expect(gh.asset(INDEX_TAG, INDEX_FILE)).toBeUndefined();
  });

  it("does nothing when every version is already published", async () => {
    const gh = new FakeGitHub();
    await publish(gh, [built("linear", "1.0.0")], "abc123");
    gh.log = [];
    expect(await publish(gh, [built("linear", "1.0.0")], "def456")).toEqual({ entries: [], draft: null });
    expect(gh.log).toEqual([]);
  });

  it("accumulates merges on top of the signed index", async () => {
    const gh = new FakeGitHub();
    await publish(gh, [built("linear", "1.0.0")], "abc123");
    const signed = { ...draftOf(gh), plugins: draftOf(gh).plugins.map((e) => ({ ...e, published_at: 1_700_000_000_000 })) };
    gh.put(INDEX_TAG, INDEX_FILE, serializeIndex(signed));
    await publish(gh, [built("linear", "1.1.0")], "def456");
    await publish(gh, [built("linear", "1.1.0"), built("slack", "1.0.0")], "fed789");
    const draft = draftOf(gh);
    expect(draft.sequence).toBe(2);
    expect(draft.plugins.map((e) => `${e.id}@${e.version}:${e.published_at}`)).toEqual(["linear@1.0.0:1700000000000", "linear@1.1.0:0", "slack@1.0.0:0"]);
    expect(serializeIndex({ ...draft, sequence: 1, plugins: draft.plugins.slice(0, 1) })).toBe(serializeIndex(signed));
  });

  it("fails on a published version whose build changed", async () => {
    const gh = new FakeGitHub();
    await publish(gh, [built("linear", "1.0.0")], "abc123");
    await expect(publish(gh, [built("linear", "1.0.0", "other bytes")], "def456")).rejects.toThrow(/bump the version/);
  });

  it("finishes a release a crashed run left behind, and refuses a different asset", async () => {
    const gh = new FakeGitHub();
    gh.release("linear-1.0.0", true);
    await publish(gh, [built("linear", "1.0.0")], "abc123");
    expect(gh.log.slice(0, 2)).toEqual(["upload linear-1.0.0/linear-1.0.0.json", "publish linear-1.0.0"]);

    const other = new FakeGitHub();
    other.put("slack-1.0.0", "slack-1.0.0.json", "tampered");
    await expect(publish(other, [built("slack", "1.0.0")], "abc123")).rejects.toThrow(/already holds a different/);
  });

  it("needs the index release and every plugin to build", async () => {
    await expect(publish(new FakeGitHub(false), [built("linear", "1.0.0")], "abc")).rejects.toThrow(/no index release/);
    await expect(publish(new FakeGitHub(), [{ plugin: { id: "x", dir: "" }, error: "boom" }], "abc")).rejects.toThrow("x: boom");
  });
});
