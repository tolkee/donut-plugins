import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { Grant, PluginManifest } from "@donut/protocol";
import { type Rollup, build, createServer } from "vite";

import { checkManifest } from "./check.ts";
import { grantOf, normalizeManifest } from "./grant.ts";

export { checkManifest } from "./check.ts";
export { diffGrant, grantOf, needsApproval, normalizeManifest } from "./grant.ts";

export const BUNDLE_FORMAT = 1;
export const PLUGIN_API = 1;
export const BUNDLE_FILE = "donut-plugin.json";
export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;
const PROVIDED = ["react", "react/jsx-runtime", "react-dom", "@donut/sdk", "@donut/ui"];
const ENTRIES = ["src/index.tsx", "src/index.ts"];

export interface Bundle {
  format: number;
  api: number;
  manifest: PluginManifest;
  files: Record<string, string>;
}

export interface Built {
  path: string;
  sha256: string;
  size: number;
  manifest: PluginManifest;
  grant: Grant;
}

async function entryOf(dir: string): Promise<string> {
  for (const entry of ENTRIES) {
    const path = join(dir, entry);
    if (await readFile(path).then(() => true, () => false)) return path;
  }
  throw new Error(`${dir} has no ${ENTRIES.join(" or ")}`);
}

async function packageVersion(dir: string): Promise<string> {
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as { version?: string };
  return pkg.version ?? "";
}

export async function readManifest(dir: string): Promise<PluginManifest> {
  const entry = await entryOf(dir);
  const server = await createServer({ configFile: false, root: dir, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const plugin = (await server.ssrLoadModule(entry)) as { default?: unknown };
    const sdk = (await server.ssrLoadModule("@donut/sdk")) as { toManifest(plugin: unknown): PluginManifest };
    if (!plugin.default) throw new Error(`${entry} must \`export default definePlugin({...})\``);
    const manifest = sdk.toManifest(plugin.default);
    return { ...manifest, version: manifest.version || (await packageVersion(dir)) };
  } finally {
    await server.close();
  }
}

async function compile(dir: string): Promise<Record<string, string>> {
  const output = (await build({
    configFile: false,
    root: dir,
    logLevel: "warn",
    publicDir: false,
    mode: "production",
    esbuild: { jsx: "automatic", jsxDev: false },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: true,
      cssCodeSplit: false,
      reportCompressedSize: false,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      lib: { entry: await entryOf(dir), formats: ["cjs"], fileName: () => "index.js" },
      rollupOptions: { external: (id) => PROVIDED.some((p) => id === p || id.startsWith(`${p}/`)), output: { exports: "named", interop: "auto" } },
    },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[];
  const files = (Array.isArray(output) ? output : [output]).flatMap((o) => o.output);
  const chunks = files.filter((f): f is Rollup.OutputChunk => f.type === "chunk");
  if (chunks.length !== 1) throw new Error(`the plugin must build to one script (got ${chunks.length}): avoid dynamic imports`);
  const style = files
    .filter((f): f is Rollup.OutputAsset => f.type === "asset" && f.fileName.endsWith(".css"))
    .map((f) => String(f.source))
    .join("\n");
  return { "index.js": chunks[0]!.code, ...(style ? { "style.css": style } : {}) };
}

export async function buildPlugin(pluginDir: string, outDir = join(pluginDir, "dist")): Promise<Built> {
  const dir = resolve(pluginDir);
  const manifest = await readManifest(dir);
  const problems = checkManifest(manifest);
  if (problems.length > 0) throw new Error(`${manifest.id}: ${problems.join("; ")}`);
  const bundle: Bundle = { format: BUNDLE_FORMAT, api: PLUGIN_API, manifest, files: await compile(dir) };
  const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`);
  if (bytes.length > MAX_BUNDLE_BYTES) throw new Error(`the bundle is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB`);
  const path = join(resolve(outDir), BUNDLE_FILE);
  await mkdir(dirname(path), { recursive: true });
  await rm(path, { force: true });
  await writeFile(path, bytes);
  return { path, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, manifest, grant: grantOf(normalizeManifest(manifest)) };
}
