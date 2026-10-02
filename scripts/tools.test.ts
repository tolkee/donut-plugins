import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { PluginManifest } from "@donut/protocol";
import { describe, expect, it } from "vitest";

import { devIndex } from "./dev-index.ts";
import { grant } from "./fixtures/entries.ts";
import { addCommand } from "./keygen.ts";
import { IMAGE } from "./lib/image.ts";
import { parseIndex, sha256 } from "./lib/index.ts";
import type { BuiltPlugin } from "./lib/plugins.ts";
import { generateKey, rawPublicKey, verifyBytes } from "./lib/sign.ts";

describe("keygen", () => {
  it("stores the key with an empty trusted-app list, never in argv", () => {
    expect(addCommand("QUJD+/==")).toBe('add-generic-password -s donut-plugins-index -a donut -T "" -w QUJD+/==\n');
    expect(() => addCommand("abc\nadd-generic-password -s other")).toThrow(/base64/);
  });
});

describe("dev-index", () => {
  it("serves a signed loopback index", () => {
    const bytes = Buffer.from("bundle");
    const built = { id: "linear", bytes, sha256: sha256(bytes), size: bytes.length, path: "", warnings: [], grant: grant(), manifest: { id: "linear", name: "Linear", description: "", version: "1.0.0" } as PluginManifest } as BuiltPlugin;
    const key = generateKey();
    const files = devIndex([built], "http://127.0.0.1:8788", key, 1_800_000_000_000);
    const index = parseIndex(files.get("index.json")!.toString());
    expect(index.sequence).toBe(1_800_000_000);
    expect(index.plugins[0]).toMatchObject({ url: "http://127.0.0.1:8788/linear-1.0.0.json", published_at: 1_800_000_000_000, sha256: sha256(bytes) });
    expect(files.get("linear-1.0.0.json")).toEqual(bytes);
    expect(verifyBytes(files.get("index.json")!, files.get("index.json.sig")!.toString(), rawPublicKey(key))).toBe(true);
  });
});

describe("pinned image", () => {
  it("is the same in CI, publish and sign-index", async () => {
    for (const workflow of ["ci.yml", "publish.yml"]) {
      const text = await readFile(join(import.meta.dirname, "..", ".github", "workflows", workflow), "utf8");
      expect(text).toContain(`image: ${IMAGE}\n`);
    }
    expect(IMAGE).toMatch(/^node:24\.\d+\.\d+-bookworm@sha256:[0-9a-f]{64}$/);
    const nodeVersion = (await readFile(join(import.meta.dirname, "..", ".node-version"), "utf8")).trim();
    expect(IMAGE.startsWith(`node:${nodeVersion}-`)).toBe(true);
  });
});
