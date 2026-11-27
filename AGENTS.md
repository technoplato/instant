# Working in this fork

Read [FORK.md](FORK.md) first: what this fork is, what is ours, how upstream is merged, and why GitHub Actions stays
off here.

Upstream's own rules for this codebase are in `dev-llm-rules.md` (repository root), `client/dev-llm-rules.md` and
`server/dev-llm-rules.md`. Read the one for the folder you are changing; they still apply.

## Rules

- **Merge upstream, never rebase.** `git fetch upstream && git merge upstream/main` into `main`. Never rebase `main`,
  never force-push it, never rewrite a commit that is already pushed.
- **Never publish from here.** No npm, PyPI or container publish under Instant's names, and no deploy. Do not turn
  GitHub Actions on for this repository, and do not edit upstream's workflow files.
- **Keep it public-safe.** This repository is public. No issue numbers or links from private trackers, no home-folder
  paths, machine names, personal email addresses, real app ids or tokens, in files or in commit messages. Check that
  `git var GIT_COMMITTER_IDENT` shows a GitHub noreply address before you commit: with no identity set, git writes
  the machine's user and host name into the commit.
- **Test first.** A failing test in its own commit (`red: ...`), then the change that passes it (`green: ...`).
- **Keep our changes to upstream's files small**, so merges from upstream stay easy. New code of ours goes in its own
  files or folders where it can.
- **A protocol change lands everywhere at once**: the server, `@instantdb/core`, and each client library that lives
  in this repository, with a shared fixture under `protocol/fixtures/` once that folder exists.

## Tests

    make -C server test                        # needs the Clojure CLI, a JDK and a migrated Postgres on localhost:5432
    pnpm -C client test                        # every client package (turbo test:ci)
    pnpm -C client/packages/core test:ci       # @instantdb/core alone (vitest run, then tsc)

Say which suites you ran and their counts. A suite that could not be run is reported as not run, never as passing.

## About this file

Upstream's `.gitignore` lists `AGENTS.md` and `CLAUDE.md`, because `make setup-dev-llm-rules` generates local copies
from `dev-llm-rules.md`. In this fork the two root files are tracked on purpose (added with `git add -f`). This file
does not carry the heading that the Makefile target looks for, so that target leaves the repository root alone; it
still works for `client/` and `server/`.
