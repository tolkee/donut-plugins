# Writing a Donut plugin

A Donut plugin adds windows, tools for the agent, title bar items, settings and a skill that teaches
the agent when and how to use them. Plugins run sandboxed and are installed while Donut runs: from
the marketplace once reviewed and published from this repo, or from a folder on your own Donut.

A plugin you only use yourself never needs publishing: build it and install it from its folder.

## Start from the template

Everything builds inside this repo: `kit/` holds Donut's `@donut/sdk`, `@donut/ui` and
`@donut/plugin-build`, and every folder in `plugins/` is part of the pnpm workspace.

```bash
git clone https://github.com/tolkee/donut-plugins && cd donut-plugins
cp -R template plugins/notes
# plugins/notes/package.json: "name": "donut-plugin-notes", "version": "0.1.0"
# plugins/notes/src/index.tsx: id "notes", name, description, permissions
pnpm install
pnpm build notes      # → dist/notes/donut-plugin.json and plugins/notes/dist/donut-plugin.json
```

Then ask Donut: "install the plugin in ~/dev/donut-plugins/plugins/notes" (the
`marketplace__install_local` tool). Donut shows what the plugin can do and installs it after you
click Install. Rebuild and install again to update it.

Never edit `kit/`. It is exported from Donut and checked against `kit/KIT.json` by CI.

## The shape of a plugin

`src/index.tsx` default-exports `definePlugin({...})` from `@donut/sdk`:

- `id` (`^[a-z][a-z0-9-]{1,31}$`, equal to the folder name), `name`, `description`; the version
  comes from `package.json`.
- `permissions`:
  - `hosts`: exact https host names `ctx.fetch` may reach;
  - `links`: hosts `ctx.openExternal(url)` may open in the browser, exact (`linear.app`) or a
    subdomain wildcard (`*.slack.com`), https only;
  - `state`: `kanban_read` to read boards (and open a linked `kanban.card`), `canvas_read` to see
    other windows' titles;
  - `agentSend`: send text to Donut.

  Anything not declared is refused by the core.
- `settings`: keys start with `<id>.`. A secret declares `secret: true` and `allowed_hosts`, which
  must be in `permissions.hosts`. Use it in a header as `{{secret:<id>.token}}`: the core fills it
  in, the plugin never sees the value.
- `kinds`: windows, `<id>.<name>`. The component gets `{ item, props, setProps, setTitle, ctx, active }`.
- `tools`: `<id>__<name>` for the agent. Mark anything that changes data with `effect: "write"` and
  anything that acts as the user (posting, sending) with `effect: "act_as_user"`: Donut then holds
  every call for the user's yes, using `confirm: { title, detailField? }` when you give one. Name
  the target in the title ("Post in {channel}").
- `statusItems`: `compute(ctx) → { text, dot? } | null` is drawn in the title bar (`null` hides
  it); `popover` is a component shown on hover; `onClick(ctx)` may open a window. Donut recomputes
  on state changes and on a timer, so keep `compute` cheap: read a module-level store that your own
  polling fills.
- `notifiers`: `{ phone: defineNotifier({ description, send({ title, body, priority }, ctx) }) }`
  delivers Donut's phone pings (ntfy, Pushover…) when the user picks it in Presence settings. It
  only ever gets Donut's short status line (`priority` is `default` or `high`), never agent text,
  and no agent can call it. At most two per plugin.
- `skill`: `{ description, markdown, requires? }`. The description is one line saying when to use
  the plugin in the user's words; the markdown (`src/SKILL.md`) says how to use it well. Keep
  safety rules in the tools themselves: the skill is advice, the core is the guard.

## What a plugin can't do

It runs in a sandboxed frame with no network of its own, no popups, no remote images, no access to
Donut's window, storage, files, clipboard, sessions or settings, and no other plugin's data or
secrets. `ctx.fetch` goes through the core, to declared hosts only; `ctx.openExternal` opens
declared link hosts only. It reads its own windows, data and settings, and opens, updates or closes
only its own windows. Imports are limited to `react`, `react-dom`, `@donut/sdk` and `@donut/ui`;
bundle anything else (the bundle is at most 5 MB). Images from remote hosts don't load: give every
`<img>` an `onError` fallback.

## Checks

- `pnpm check [id]` validates the manifest with the same rules as the core.
- `pnpm test` runs every plugin's tests. Test tools with `runTool(plugin, name, input, ctx)` and a
  fake `ctx` (see `template/src/index.test.ts`), and assert `checkManifest(toManifest(plugin))` is
  empty.
- `pnpm typecheck` checks everything.

## Publishing to the marketplace

Open a pull request that adds or changes `plugins/<id>`.

- **Versions.** Any change to a published plugin, including its dependencies or the lockfile, needs
  a version bump in its `package.json`, greater than every version published before. CI rebuilds
  every plugin and fails when a published version would change.
- **CI** (`ci.yml`, no secrets) installs, verifies `kit/`, typechecks, tests, audits the production
  dependencies, builds every plugin, validates the manifests (id = folder, `name:
  "donut-plugin-<id>"`, bundle ≤ 5 MB) and posts a sticky comment with the permission changes:
  what needs the user's approval when they update (hosts, secrets, write and act-as-user tools,
  state, agent send, links, skill) and what is only listed (windows, title bar items). Changes to
  `kit/`, `.github/`, `scripts/` or the root config are refused from anyone but the maintainer.
- **Review.** An automated Claude review comments on what reviewers look for: permissions that
  match what the code fetches, user data sent only to declared hosts and never encoded into opened
  links, writes and acting as the user declared with a confirmation that names the target, tool
  descriptions and a skill that don't steer the agent around Donut's rules, no obfuscated code, and
  every new dependency named. It's advisory: the maintainer's approval merges.
- **Release.** On merge, each new version is built on a clean runner and uploaded once to its own
  release (`<id>-<version>`), and added to an unsigned draft index. The maintainer then rebuilds it
  locally in the same container, checks it's byte-identical, and signs the index. Donut lists it
  from then on, and offers it as an update 24 hours after signing.
- **Yanking.** A broken or harmful version is yanked: Donut stops offering it and disables it where
  it's installed.
