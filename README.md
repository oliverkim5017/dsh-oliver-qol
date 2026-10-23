# dsh-oliver-qol

Personal quality-of-life features for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh), bundled as one plugin. Each feature lives in its own module under `src/features/`, carries its own config section, locale namespace, route prefix, and tests, and never imports another feature.

| Feature | State | What it does |
|---|---|---|
| `session-delete` | implemented | Permanently deletes a stored session (log, projection cache, workspace accounting, orphaned `.agent-teams` state, task-board execution references) from the session row menu, cascading into its subagent child sessions |
| `extend-settings` | implemented | Adds an **Extend settings** tab (last) to the settings page; it declares the `settings.extend-settings.item` list slot every QoL setting row registers into |
| `opencode-search` | implemented | The row in that tab: routes the built-in `web_search` tool through OpenCode Go — endpoint and key reference follow the `dsh-opencode-go` plugin settings, while the search model and the proxy address (host + port) are set in the row itself and touch nothing else. Off by default; while off it delegates to the built-in DeepSeek search provider |

## Compatibility

Built against dsh `0.2.0-rc.2`. dsh APIs are pre-stable, so the manifest declares open-ended floors (`>=0.2.0-rc.2`) instead of pins: a dsh upgrade must not silently drop the bundle, and a real API break surfaces as an error to fix rather than as a plugin that vanished.

## Install

The plugin is a dsh bundle: its `package.json` declares `dsh.bundle` (host half) and `dsh.client` (browser half).

```bat
:: from npm (the supported path — the published tarball already contains lib/)
dsh plugin --profile web add dsh-oliver-qol

:: from a local checkout (development loop)
dsh plugin --profile web add link:D:\2Code\dsh-oliver-qol
```

Install it as an **npm package**, never as a `github:` dependency. A git install fetches source, so pnpm rebuilds it on every install, needs a working `pnpm` on `PATH`, needs an `allowBuilds` entry keyed by the exact commit URL, and leaves the lockfile pinned to the old commit — enough to make the plugin manager report a failure even though the install succeeded. The published package ships `lib/`, so none of that applies. See [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) for the full evidence.

Restart dsh after adding, updating, or removing the plugin. The bundle patch (`cordis.patch.yml`) mounts one row (`id: oliver-qol`, `name: dsh-oliver-qol`) and points the web seam's `searchProvider` at the `opencode-go` provider this bundle registers.

## Release

```bat
npm version minor   :: patch | minor | major
npm publish         :: prepublishOnly rebuilds lib/ and runs the tests
```

`lib/` is gitignored and built at publish time; it is **not** committed.

## Configuration

```yaml
- id: oliver-qol
  config:
    sessionDelete:
      sessionsRoot: <path>          # default: dshHomePath('sessions')
      quiescenceTimeoutMs: 15000    # default: 15000
      quiescencePollMs: 200         # default: 200
      removeOrphanedTeamState: true # default: true
      pruneTaskBoardReferences: true # default: true
      taskBoardLedgerPath: <path>   # default: dshHomePath('task-board', 'ledger-v2.json')
    opencodeSearch:
      enabled: false                # default: delegate to the built-in search provider
      model: deepseek-v4.1-flash    # auxiliary Messages model; any OpenCode Go id
      proxyUrl: ''                  # search-only proxy host; empty connects directly
      proxyPort: ''                 # search-only proxy port; empty keeps the URL's own
```

`sessionDelete.sessionsRoot` must match the `root` of the profile's `session-persistence-jsonl` row (`$DSH_HOME/sessions` by default). If a deployment moves that root, set both.

`removeOrphanedTeamState` and `pruneTaskBoardReferences` clean the two pieces of state that only *reference* a session, after its log is gone. Both are best-effort: a failure is warned and skipped, never surfaced as a failed delete, because the session the user asked to delete is already deleted.

- **AgentTeams** keeps `<workspace>/.agent-teams/<teamId>/` (`team.json` + member inboxes) under the directory the session ran in. When the delete removes a team's `captainSessionId`, that team can never be resumed — the plugin treats the captain as its only owner key — so the directory is removed. A team that lost only a *member* while its captain lives may still be running or resumable, so it is **reported, not edited**: rewriting `team.json` from here would race the plugin for a team it still owns.
- **Task board** keeps `$DSH_HOME/task-board/ledger-v2.json`, and every card's `executions[]` entry pins the session that performed it. Only those dangling records are dropped. Cards, columns, prompts, schedules and open executions (`endedAt` absent) are never touched, and an unknown `schemaVersion` is refused rather than pattern-matched. The replace is optimistic — the file is re-read immediately before the write, and any concurrent change aborts the pass — so losing one cleanup pass is possible and harmless; clobbering the board's newest state is not.

`opencodeSearch` is a live section: the **Extend settings** row writes it without a restart. Per search, the provider reads the `baseURL` and `apiKeyEnv` that the `opencode-go` profile row (the `dsh-opencode-go` plugin) currently resolves, and resolves that credential reference through the credentials service — the same `OPENCODE_API_KEY` the chat route uses. Those are the only two facts it borrows: the proxy is the row's own (`proxyUrl`/`proxyPort`), so nothing configured for chat traffic reaches a search, and nothing a search sets reaches chat. Without that plugin the documented defaults apply (`https://opencode.ai/zen/go/v1`, `OPENCODE_API_KEY`).

`proxyUrl` takes a host (`127.0.0.1`), a host and port (`127.0.0.1:7890`), or a full URL with a scheme (`socks5://127.0.0.1`); a bare host is read as HTTP. `proxyPort` is a decimal 1–65535 and overrides any port inside `proxyUrl`; empty means the search uses whatever port the address carries. Both empty connects directly. The Extend-settings row commits each half on blur or Enter — one typed address is one write — and refuses a port the host would refuse, so the row and the next search cannot disagree.

### How the search selection works

The bundle patch points the web seam at this provider (`web.searchProvider: opencode-go`). While the Extend-settings row is off, the provider delegates every search to the built-in `deepseek-official` provider, so installing this plugin changes nothing until the feature is enabled. A deployment can drop the `web` override from `cordis.patch.yml` (or its own profile patch) to ignore the provider entirely.

One search is one auxiliary model turn against the OpenCode Go endpoint with the native `web_search_20250305` server tool — latency plus tokens count against the Go usage quota. `deepseek-v4.1-flash` is verified end-to-end through this provider (10 structured results, ~10k input tokens); other Go model ids are selectable but unverified for server-side search. OpenCode Go requires `x-opencode-session` on every request: the provider sends the initiating conversation's id and, outside a conversation, one stable per-instance id.

## Development

```sh
pnpm install
pnpm test          # vitest
pnpm typecheck     # tsc, no emit
pnpm lint          # oxlint
pnpm build         # tsc host half -> lib/, esbuild browser half -> lib/client.js
```

`lib/` is not committed. The client bundle is one CJS artifact wrapped in `window.__ModuleLoader__.load({ id: 'dsh-oliver-qol', factory })`; platform modules (`react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-store`) stay external and resolve through the injected `require`.

Adding a feature: create `src/features/<name>/` (with its own `client/` half when it has UI), then add one line to `src/features/index.ts` and one to `src/client/index.ts`. A client-only feature skips `src/features/index.ts` and adds only its client line. A setting row registers one entry into the `settings.extend-settings.item` slot declared by `extend-settings` — the slot key (and nothing else) is the contract between the hub and the row. Keep features independent — share code only through a `src/shared/` module that at least two features actually use.

## Manual acceptance (needs a dsh restart)

After `dsh plugin --profile web add link:...` and a restart of `dsh web`:

1. Open a session's "..." menu — `Delete session` sits below `Archive session`, in red.
2. Delete a plain session: confirm, then check the row disappears and `$DSH_HOME/sessions/<project>/<id>/` is gone.
3. Delete a session that spawned subagents: the dialog names the child count; confirm the child directories and their `session_projcache` rows are gone.
4. Delete the session that is currently open: it is stopped and released first; expect the conversation view to clear.
5. Delete an archived session from the archived filter.
6. Check `$DSH_HOME/storages/session_projcache` no longer holds rows for the deleted ids, and that workspace accounting (`$DSH_HOME/storages/workspace.json`) dropped them.
6a. Delete the captain of a team that ran in a workspace: `<workspace>/.agent-teams/<teamId>/` is gone. Delete only one member and keep the captain: the directory stays and the log carries one `team <teamId>: member session(s) deleted but the captain lives` warning.
6b. Delete a session that the task board ran: its card in `$DSH_HOME/task-board/ledger-v2.json` keeps its title, column, prompt and schedule, while the `executions[]` entry whose `sessionId` matched is gone. A card with a still-running execution keeps that record.
7. Open Settings and select **Extend settings** (last tab), enable **OpenCode Go web search**, keep `deepseek-v4.1-flash`, and ask the model to search the web: the tool result lists sources instead of the `DEEPSEEK_API_KEY` error. Disable the toggle and search again: the search falls back to the built-in provider (behavior and errors as before).
8. With the feature enabled, type a proxy into **Search proxy** (host in the first field, port in the second, e.g. `127.0.0.1` / `7890`): the write lands when the field is left, the next search dials through it, and chat traffic is unaffected. Clear both fields and search again: the search connects directly.
9. Type an impossible port (`0`, `99999`) into the port field and leave it: nothing is written, and the field keeps the text so it can be corrected. An address the transport cannot read (`not a url`) stays saved and makes the *next* search fail loudly, naming the address.

## Known limitations

- Deletion is permanent; there is no undo. Use archive for reversible hiding.
- A session written by another dsh process at the same time fails loudly (`session-delete/busy`) on Windows file locks; retry after that process stops.
- Deleting the currently open session relies on the shipped archive-driven release of the main view; if the client does not release it in time, the request answers `busy` and can be retried.
- The JSONL storage layout (project directory + encoded session segment) is the only format coupling; it lives in `src/features/session-delete/jsonl-layout.ts` and `removal.ts` and must be re-checked on dsh upgrades.
- The two reference cleanups couple to *other plugins'* on-disk layouts, both isolated in their own module and both re-checkable on their plugin's upgrades: `.agent-teams/<teamId>/team.json` (`team-state.ts`) and `task-board/ledger-v2.json` schema 6 (`task-board.ts`). Neither plugin is a dependency — a missing directory, an unknown schema, or an unparsable file leaves the delete behaving exactly as before.
- Task-board pruning is optimistic, not locked: if the board writes between the planning read and the replace, that pass is skipped (`changed`) and the stale references survive until the next delete. There is no retry loop on purpose.
- `opencode-search` delegates to the built-in provider by reading the web service's provider registry (`web.searchProviders`) — a dsh-internal surface pinned to the 0.2.0-rc.2 line; re-check it on upgrades. The Extend-settings row writes the `oliver-qol` profile entry, so renaming the bundle row id makes the row report `unavailable`.
- `opencode-search` follows the `opencode-go` entry's base `apiKeyEnv` reference only; multi-account setups (`accounts`/`autoSwitch` in `dsh-opencode-go`) are not followed per search.
- `opencode-search`'s proxy is its own setting: it applies to the search request only. A deployment that wants the search behind the same proxy as chat has to type that address into the new row as well — there is no "follow the OpenCode Go proxy" mode.
- Each OpenCode search is a full auxiliary model turn against the Go quota; this provider does not append the built-in `web/deepseek-search-llm-request` session event.
