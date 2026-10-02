import { appendFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyKit } from "./verify-kit.ts";

async function kitCopy(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "kit-")), "kit");
  await cp(join(import.meta.dirname, "..", "kit"), dir, { recursive: true, filter: (src) => !src.includes("node_modules") });
  return dir;
}

describe("verifyKit", () => {
  it("accepts the vendored kit", async () => {
    expect(await verifyKit()).toEqual([]);
  });

  it("names edited, missing and extra files", async () => {
    const dir = await kitCopy();
    await appendFile(join(dir, "sdk/src/index.ts"), "\n");
    await rm(join(dir, "ui/src/age.ts"));
    await writeFile(join(dir, "sdk/src/extra.ts"), "");
    const problems = await verifyKit(dir);
    expect(problems).toHaveLength(3);
    expect(problems.join("\n")).toMatch(/sdk\/src\/index.ts was edited[\s\S]*ui\/src\/age.ts is missing[\s\S]*sdk\/src\/extra.ts is not in KIT.json/);
  });
});
