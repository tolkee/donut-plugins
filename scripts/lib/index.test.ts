import { describe, expect, it } from "vitest";

import { entry, grant } from "../fixtures/entries.ts";
import {
  type MarketplaceIndex,
  addEntries,
  canonicalGrant,
  compareVersions,
  draftChanges,
  latestOf,
  newEntry,
  parseIndex,
  pendingDraft,
  releaseUrl,
  serializeIndex,
  yank,
} from "./index.ts";

const signed: MarketplaceIndex = { sequence: 3, plugins: [entry("linear", "1.0.0", { published_at: 1_700_000_000_000 }), entry("slack", "1.0.0", { published_at: 1_700_000_000_000 })] };

describe("urls", () => {
  it("puts each version on its own release", () => {
    expect(releaseUrl("linear", "1.2.0")).toBe("https://github.com/tolkee/donut-plugins/releases/download/linear-1.2.0/linear-1.2.0.json");
    expect(newEntry({ id: "linear", name: "Linear", description: "", version: "1.2.0", sha256: "a", size: 1, grant: grant() })).toMatchObject({
      published_at: 0,
      min_donut: null,
      yanked: false,
      repo_path: "plugins/linear",
      summary: [],
    });
  });
});

describe("serialization", () => {
  it("is stable whatever the key order", () => {
    const shuffled = JSON.parse(JSON.stringify({ plugins: signed.plugins.map((e) => Object.fromEntries(Object.entries(e).reverse())), sequence: 3 })) as MarketplaceIndex;
    expect(serializeIndex(shuffled)).toBe(serializeIndex(signed));
    expect(serializeIndex(parseIndex(serializeIndex(signed)))).toBe(serializeIndex(signed));
  });

  it("sorts secrets by key and keeps list order", () => {
    const g = canonicalGrant(grant({ secrets: { "x.b": ["b.com"], "x.a": ["a.com"] }, hosts: ["b.com", "a.com"] }));
    expect(Object.keys(g.secrets)).toEqual(["x.a", "x.b"]);
    expect(g.hosts).toEqual(["b.com", "a.com"]);
  });
});

describe("draft", () => {
  it("starts from the signed index with the next sequence", () => {
    const draft = pendingDraft(signed, null);
    expect(draft.sequence).toBe(4);
    expect(serializeIndex(draft)).toBe(serializeIndex({ ...signed, sequence: 4 }));
  });

  it("accumulates merges between two signings", () => {
    const first = addEntries(pendingDraft(signed, null), [entry("linear", "1.1.0")]);
    const second = addEntries(pendingDraft(signed, first), [entry("slack", "1.1.0")]);
    expect(second.sequence).toBe(4);
    expect(second.plugins.map((e) => `${e.id}@${e.version}`)).toEqual(["linear@1.0.0", "slack@1.0.0", "linear@1.1.0", "slack@1.1.0"]);
  });

  it("keeps old entries byte-identical, even if the draft altered them", () => {
    const tampered = { sequence: 4, plugins: signed.plugins.map((e) => ({ ...e, sha256: "f".repeat(64) })) };
    const draft = pendingDraft(signed, tampered);
    expect(serializeIndex({ ...draft, sequence: 3 })).toBe(serializeIndex(signed));
  });

  it("keeps a pending yank", () => {
    const draft = pendingDraft(signed, yank(pendingDraft(signed, null), "slack", "1.0.0"));
    expect(draft.plugins.find((e) => e.id === "slack")?.yanked).toBe(true);
  });

  it("drops a draft that was already signed", () => {
    const stale = { sequence: 3, plugins: [...signed.plugins, entry("old", "1.0.0")] };
    expect(pendingDraft(signed, stale).plugins).toHaveLength(2);
  });

  it("refuses to add a version twice", () => {
    expect(() => addEntries(pendingDraft(signed, null), [entry("linear", "1.0.0")])).toThrow(/already in the index/);
  });
});

describe("draftChanges", () => {
  it("lists new versions and yanks", () => {
    const draft = addEntries(yank(pendingDraft(signed, null), "slack", "1.0.0"), [entry("linear", "1.1.0")]);
    const changes = draftChanges(signed, draft);
    expect(changes.added.map((e) => e.version)).toEqual(["1.1.0"]);
    expect(changes.yanked.map((e) => e.id)).toEqual(["slack"]);
  });

  it("refuses a draft that isn't newer", () => {
    expect(() => draftChanges(signed, { ...signed })).toThrow(/not newer/);
  });

  it("refuses a changed or missing old entry", () => {
    const changed = { sequence: 4, plugins: [{ ...signed.plugins[0]!, size: 7 }, signed.plugins[1]!] };
    expect(() => draftChanges(signed, changed)).toThrow(/changed in the draft/);
    expect(() => draftChanges(signed, { sequence: 4, plugins: [signed.plugins[0]!] })).toThrow(/missing from the draft/);
  });

  it("refuses an un-yank", () => {
    const yanked = { sequence: 3, plugins: [{ ...signed.plugins[0]!, yanked: true }] };
    expect(() => draftChanges(yanked, { sequence: 4, plugins: [signed.plugins[0]!] })).toThrow(/changed in the draft/);
  });
});

describe("versions", () => {
  it("orders semantic versions", () => {
    const ordered = ["0.9.0", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.2.0", "1.10.0"];
    expect([...ordered].reverse().sort(compareVersions)).toEqual(ordered);
  });

  it("finds the latest version of a plugin", () => {
    expect(latestOf([entry("a", "1.2.0"), entry("a", "1.10.0"), entry("b", "9.0.0")], "a")?.version).toBe("1.10.0");
    expect(latestOf([], "a")).toBeUndefined();
  });
});
