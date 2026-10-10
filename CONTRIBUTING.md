# Contributing

Thanks for wanting to improve Mumble AI. Small, clear changes are easier to review than a rewrite.

## Before you start

1. Fork https://github.com/maaz-ahmad-63/mumble_flow and clone your fork.
2. Install Node.js 22 or 24 LTS (20 still works).
3. Run `npm install`, then `npm test`. Or run `scripts/setup.ps1` (Windows) or `scripts/setup.sh` (macOS, Linux) with `-NoStart` / `--no-start`.

## Change

1. Create a branch from `main`.
2. Keep the change to one thing: a bug, a doc fix, or one feature.
3. If install or hosting steps change, update `docs/setup.md`, the matching guide in `docs/deploy/`, and the README in the same branch.
4. Run `npm test` before you open the pull request.

Do not commit `.env` or `data/whisperflow_store.json`. Those can contain personal keys and history.

## Pull request

Use the pull request template. Say what changed and how you checked it.

The GitHub Action runs `npm test` on the pull request. It should be green before merge.

## Coding agents

If an agent writes the change, it should follow [AGENTS.md](AGENTS.md). You are still the person who reviews the diff before it is pushed.
