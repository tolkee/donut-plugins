import { grantOf, normalizeManifest } from "@donut/plugin-build";
import type { MarketplaceEntry, PluginManifest } from "@donut/protocol";
import { toManifest } from "@donut/sdk";
import { describe, expect, it } from "vitest";

import hello from "../template/src/index.tsx";
import { entry, grant } from "./fixtures/entries.ts";
import { type MarketplaceIndex, addEntries, newEntry, pendingDraft, sha256, yank } from "./lib/index.ts";
import { prepare, summary, verifyEntry } from "./sign-index.ts";

const REPO = "tolkee/donut-plugins";
const manifest: PluginManifest = { ...toManifest(hello), version: "1.0.0" };
const asset = Buffer.from(`${JSON.stringify({ format: 1, api: 1, manifest, files: { "index.js": "" } })}\n`);
const good: MarketplaceEntry = newEntry({ id: "hello", name: manifest.name, description: manifest.description, version: "1.0.0", sha256: sha256(asset), size: asset.length, grant: grantOf(normalizeManifest(manifest)) }, REPO);

describe("verifyEntry", () => {
  it("accepts a release equal to the rebuild and to the draft", () => {
    expect(verifyEntry(good, asset, asset, REPO)).toEqual([]);
  });

  it("refuses a hash mismatch between the asset, the rebuild and the draft", () => {
    const other = Buffer.from(`${asset.toString().trim()} \n`);
    expect(verifyEntry(good, asset, other, REPO)).toEqual([expect.stringMatching(/local rebuild's sha256/)]);
    expect(verifyEntry(good, other, asset, REPO)).toEqual([expect.stringMatching(/released asset's sha256/), expect.stringMatching(/the asset is \d+ bytes/)]);
  });

  it("refuses a grant that isn't the bundle's", () => {
    const widened = { ...good, permissions: { ...good.permissions, hosts: [] } };
    const narrowed = { ...good, permissions: grant() };
    expect(verifyEntry(widened, asset, asset, REPO)).toEqual(["hello 1.0.0: the draft's permissions are not the bundle's grant"]);
    expect(verifyEntry(narrowed, asset, asset, REPO)).toContain("hello 1.0.0: the draft's permissions are not the bundle's grant");
  });

  it("refuses a pre-stamped, foreign or mislabelled entry", () => {
    expect(verifyEntry({ ...good, published_at: 5 }, asset, asset, REPO)).toHaveLength(1);
    expect(verifyEntry({ ...good, url: "https://evil.example/hello.json" }, asset, asset, REPO)).toEqual(["hello 1.0.0: unexpected url https://evil.example/hello.json"]);
    expect(verifyEntry({ ...good, name: "Goodbye" }, asset, asset, REPO)).toEqual(["hello 1.0.0: the name or description differs from the bundle's"]);
  });
});

describe("prepare", () => {
  const signed: MarketplaceIndex = { sequence: 2, plugins: [entry("linear", "1.0.0", { published_at: 100 }), entry("slack", "1.0.0", { published_at: 100 })] };

  it("stamps new entries with the signing time and keeps the rest", () => {
    const draft = addEntries(yank(pendingDraft(signed, null), "slack", "1.0.0"), [entry("linear", "1.1.0")]);
    const signing = prepare(signed, draft, 999);
    expect(signing.index.sequence).toBe(3);
    expect(signing.index.plugins.map((e) => [e.id, e.version, e.published_at, e.yanked])).toEqual([
      ["linear", "1.0.0", 100, false],
      ["slack", "1.0.0", 100, true],
      ["linear", "1.1.0", 999, false],
    ]);
    expect(summary(signing, signed)).toContain("+ linear 1.0.0 → 1.1.0");
    expect(summary(signing, signed)).toContain("- yank slack 1.0.0");
  });

  it("refuses a missing, stale or empty draft", () => {
    expect(() => prepare(signed, null, 1)).toThrow(/no draft/);
    expect(() => prepare(signed, { ...signed }, 1)).toThrow(/not newer/);
    expect(() => prepare(signed, pendingDraft(signed, null), 1)).toThrow(/changes nothing/);
  });

  it("refuses a draft that rewrote a signed entry", () => {
    const draft = { sequence: 3, plugins: [{ ...signed.plugins[0]!, sha256: "f".repeat(64) }, signed.plugins[1]!] };
    expect(() => prepare(signed, draft, 1)).toThrow(/changed in the draft/);
  });
});
