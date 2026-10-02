#!/usr/bin/env node
import { resolve } from "node:path";

import { buildPlugin, readManifest } from "./build.ts";
import { checkManifest } from "./check.ts";

const USAGE = "usage: donut-plugin build [plugin folder] [--out <folder>] | donut-plugin check [plugin folder]";

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const outFlag = rest.indexOf("--out");
  const out = outFlag >= 0 ? rest[outFlag + 1] : undefined;
  const positional = rest.filter((arg, i) => !arg.startsWith("--") && (outFlag < 0 || i !== outFlag + 1));
  const dir = resolve(positional[0] ?? ".");
  switch (command) {
    case "build": {
      const built = await buildPlugin(dir, out);
      console.log(`${built.manifest.id} ${built.manifest.version} → ${built.path}\n${built.size} bytes, sha256 ${built.sha256}`);
      return 0;
    }
    case "check": {
      const problems = checkManifest(await readManifest(dir));
      for (const problem of problems) console.error(`✗ ${problem}`);
      if (problems.length === 0) console.log("✓ the manifest is valid");
      return problems.length === 0 ? 0 : 1;
    }
    default:
      console.error(USAGE);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
