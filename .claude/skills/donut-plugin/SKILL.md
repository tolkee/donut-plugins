---
name: donut-plugin
description: Write, build, test and install a Donut plugin in the donut-plugins repo (scaffold from template/, local install loop, publishing rules).
---

Read `docs/writing-a-plugin.md` first; it is the reference.

1. Copy `template/` to `plugins/<id>` and run `pnpm install` at the repo root. In
   `plugins/<id>/package.json` set `"name": "donut-plugin-<id>"` and `"version": "0.1.0"`; in
   `src/index.tsx` set `id` (= the folder name), `name`, `description` and `permissions`.
2. Declare the least you need: exact `permissions.hosts`, a secret's `allowed_hosts` inside them,
   `permissions.links` for every host `ctx.openExternal` opens, and `effect: "write"` or
   `"act_as_user"` with a `confirm.title` naming the target on every tool that changes data or acts
   as the user.
3. Write `src/SKILL.md`: when to use the plugin and how, in the user's words. One-line
   `skill.description`. Safety rules belong in the tools, not the skill.
4. Test tools with `runTool` and a fake `ctx` (see `template/src/index.test.ts`), and add a test that
   `checkManifest(toManifest(plugin))` is empty.
5. `pnpm build <id>` writes `dist/<id>/donut-plugin.json`; `pnpm check <id>` validates the manifest
   with the core's rules; `pnpm test` and `pnpm typecheck` must pass.
6. Ask the user to install it ("install the plugin in <repo>/plugins/<id>"): Donut shows the
   permission card and waits for their click. Never install it yourself, and never touch Donut's
   settings for it.

Rules:
- Never edit `kit/`: it is Donut's SDK, UI and build tooling, vendored and hash-checked by CI.
- Don't touch `scripts/`, `.github/` or the root config in a plugin change.
- Any change to a published plugin (code, dependencies, lockfile) needs a version bump in its
  `package.json`, greater than every published version.
- Imports are limited to `react`, `react-dom`, `@donut/sdk` and `@donut/ui`; anything else is
  bundled (5 MB max). No `eval`, `new Function` or dynamic imports.
