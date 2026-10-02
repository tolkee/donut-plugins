import type { KeyObject } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { INDEX_FILE, SIGNATURE_FILE, assetOf, newEntry, serializeIndex } from "./lib/index.ts";
import { type BuiltPlugin, ROOT, buildAll } from "./lib/plugins.ts";
import { generateKey, pkcs8Base64, privateKeyFromPkcs8, rawPublicKey, signBytes } from "./lib/sign.ts";

const DIR = join(ROOT, ".dev-index");
const KEY_FILE = "dev-key.pkcs8";

export function devIndex(builds: BuiltPlugin[], base: string, key: KeyObject, now: number): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const plugins = builds.map((built) => {
    const { id, name, description, version } = built.manifest;
    files.set(assetOf(id, version), built.bytes);
    return { ...newEntry({ id, name, description, version, sha256: built.sha256, size: built.size, grant: built.grant }), url: `${base}/${assetOf(id, version)}`, published_at: now };
  });
  const index = Buffer.from(serializeIndex({ sequence: Math.floor(now / 1000), plugins }));
  files.set(INDEX_FILE, index);
  files.set(SIGNATURE_FILE, Buffer.from(signBytes(index, key)));
  return files;
}

async function devKey(): Promise<KeyObject> {
  const saved = await readFile(join(DIR, KEY_FILE), "utf8").catch(() => null);
  if (saved) return privateKeyFromPkcs8(saved);
  const key = generateKey();
  await mkdir(DIR, { recursive: true });
  await writeFile(join(DIR, KEY_FILE), pkcs8Base64(key), { mode: 0o600 });
  return key;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { port: { type: "string", default: "8788" } } });
  const port = Number(values.port);
  const base = `http://127.0.0.1:${port}`;
  const key = await devKey();
  const results = await buildAll(ROOT, positionals);
  for (const { plugin, error } of results.filter((r) => !r.built)) console.error(`✗ ${plugin.id}: ${error}`);
  const files = devIndex(results.flatMap((r) => (r.built ? [r.built] : [])), base, key, Date.now());
  await Promise.all([...files].map(([name, bytes]) => writeFile(join(DIR, name), bytes)));

  createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? "/").split("?")[0]!.slice(1));
    const body = req.method === "GET" ? files.get(name) : undefined;
    if (!body) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": name.endsWith(".sig") ? "text/plain" : "application/json", "Content-Length": body.length, "Cache-Control": "no-store" }).end(body);
  }).listen(port, "127.0.0.1", () => {
    console.log(`\nServing ${files.size - 2} plugin(s) on ${base}. Start Donut Dev with:\n`);
    console.log(`  DONUT_FLAVOUR=dev DONUT_MARKETPLACE_URL=${base}/${INDEX_FILE} DONUT_MARKETPLACE_KEY=${rawPublicKey(key)}\n`);
  });
}

if (import.meta.main) await main();
