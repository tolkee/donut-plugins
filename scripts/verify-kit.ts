import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const KIT = join(import.meta.dirname, "..", "kit");

interface Kit {
  donut_commit: string;
  api: number;
  files: Record<string, string>;
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split("\\").join("/"))
    .filter((path) => !path.split("/").includes("node_modules"));
}

export async function verifyKit(dir = KIT): Promise<string[]> {
  const kit = JSON.parse(await readFile(join(dir, "KIT.json"), "utf8")) as Kit;
  const problems: string[] = [];
  const present = new Set((await listFiles(dir)).filter((f) => f !== "KIT.json"));
  for (const [path, expected] of Object.entries(kit.files)) {
    if (!present.delete(path)) {
      problems.push(`kit/${path} is missing`);
      continue;
    }
    const actual = createHash("sha256").update(await readFile(join(dir, path))).digest("hex");
    if (actual !== expected) problems.push(`kit/${path} was edited (sha256 ${actual}, KIT.json says ${expected})`);
  }
  for (const extra of present) problems.push(`kit/${extra} is not in KIT.json`);
  return problems;
}

if (import.meta.main) {
  const problems = await verifyKit();
  for (const problem of problems) console.error(`✗ ${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log("✓ kit/ matches KIT.json");
}
