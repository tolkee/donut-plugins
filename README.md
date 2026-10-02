# donut-plugins

Reviewed plugins for Donut: one folder per plugin in `plugins/`, built
and published from here to Donut's marketplace. Also the place to write your own plugin, whether you
publish it or only install it on your own Donut.

```bash
pnpm install
pnpm build [id]     # → dist/<id>/donut-plugin.json
pnpm test && pnpm typecheck
```

Start with [docs/writing-a-plugin.md](docs/writing-a-plugin.md) and `template/`. With Claude Code,
the `donut-plugin` skill walks through it. `kit/` is Donut's SDK, UI and build tooling, vendored
read-only.

## Trust model

1. Every plugin runs sandboxed in Donut and only reaches the hosts, data and actions it declares; the user approves them at install and again when an update asks for more.
2. A plugin is merged only after CI (permission diff, version rules, tests) and the maintainer's review.
3. On merge, CI builds each new version once and uploads it to an immutable release; the index listing it stays unsigned.
4. The maintainer rebuilds every new version locally in the same pinned container, checks it is byte-identical to the release, and signs the index with a key that never leaves the maintainer's Keychain.
5. Donut installs only from an index signed by a key it trusts, checks each bundle's hash and permissions against it, and refuses rollbacks.

`scripts/` holds the pipeline (`check-pr`, `publish`, `sign-index`, `yank`, `keygen`, `dev-index`).
`pnpm dev-index` serves a loopback index signed with a throwaway key for Donut Dev.
