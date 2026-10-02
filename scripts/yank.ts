import { GitHub, githubToken } from "./lib/github.ts";
import { DRAFT_FILE, pendingDraft, serializeIndex, yank } from "./lib/index.ts";

async function main(argv: string[]): Promise<number> {
  const [id, version] = argv;
  if (!id || !version) {
    console.error("usage: pnpm yank <id> <version>");
    return 2;
  }
  const gh = new GitHub(await githubToken());
  const { signed, draft } = await gh.indexFiles();
  const pending = pendingDraft(signed, draft);
  if (pending.plugins.find((e) => e.id === id && e.version === version)?.yanked) {
    console.error(`${id} ${version} is already yanked`);
    return 1;
  }
  await gh.uploadAsset(await gh.indexRelease(), DRAFT_FILE, Buffer.from(serializeIndex(yank(pending, id, version))));
  console.log(`✓ ${id} ${version} is yanked in the draft: run pnpm sign-index to publish it`);
  return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
