# Agent instructions

## Work on main

Every session lands its work directly on `main`: no feature branches, no pull requests against
this repo. Sessions that start in an app worktree commit there, then run
`git fetch origin && git rebase origin/main` and `git push origin HEAD:main`. Before starting,
rebase the worktree onto `origin/main` so the session never works from a stale base.

## Keep the extension live after every change

After **any** change under `src/`, `assets/` or `package.json`, rebuild so the change is live in
Raycast immediately. Do this without being asked, at the end of each edit batch:

```bash
npm run build
```

This bundles the index worker (`assets/index-worker.cjs`) and type-checks and builds the extension
with `ray build`. If `ray develop` is running (check with `pgrep -f "ray develop"`), the
extension process hot-reloads from `src/` on save, but the worker bundle is **not** rebuilt by
`ray develop`: any change touching `src/worker/` or the modules it imports (`src/lib/indexer.ts`,
`db.ts`, `providers/`, `jsonl.ts`, `refs.ts`, `text.ts`, `git.ts`, `config.ts`) needs
`npm run build:worker` (included in `npm run build`).

Redirect the build output to a log file in the scratch directory and only surface errors.

## Verify

- `npx tsc --noEmit -p .` and `npm run lint` must pass.
- Ranking changes: simulate against the live index
  (`~/Library/Application Support/com.raycast.macos/extensions/agent-sessions-search/sessions-index.sqlite`,
  read-only, `node:sqlite`) before and after, and report the top results for a few queries.
- Scoring lives in `src/lib/search.ts`; it runs at query time, so ranking tweaks need no reindex.
  Changes to what gets indexed (`indexer.ts`, providers, meta doc) need `Rebuild Sessions Index`.
