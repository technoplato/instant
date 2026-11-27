# About this fork

This repository is a fork of [instantdb/instant](https://github.com/instantdb/instant). Its `main` branch is
upstream's `main` plus our own changes. It is meant to be the one home for the Instant code we maintain: the server,
the TypeScript client packages, and (as they move in) a Swift package and Rust crates, so that a change to the wire
protocol can land in the server and in every client together.

It is not affiliated with or endorsed by Instant. The license is upstream's ([LICENSE.md](LICENSE.md), Apache-2.0).

## What is ours

Everything on `main` that is not on upstream's `main`:

    git fetch upstream
    git log upstream/main..main

Today that is:

- **Refresh deltas.** A session that sends `features: ["refresh-delta"]` when it starts (websocket `init` or the
  admin SSE `admin-init!`) gets each changed query result as an `instaql-delta`: the triples the result gained and
  lost since the version the client holds, instead of the whole result again. `@instantdb/core` applies a delta in
  place and resubscribes when its `base-version` does not match. Sessions that do not ask get the same frames as
  before.
- **The attribute catalog is sent once to admin sessions.** `admin-init!` reads the session's features from the
  client's `versions`, so an admin `subscribeQuery` no longer receives the whole `attrs` catalog on every refresh.
- **One shared `attrsStore` in client storage**, instead of a copy inside every persisted query subscription.
- `scripts/bench-refresh-delta.mjs`, which measures wire bytes and client apply time with and without deltas.

The README's note at the top carries the measured numbers.

## Layout

| Path | What | State |
|---|---|---|
| `server/` | Upstream's server (Clojure, Postgres), plus our protocol changes | here |
| `client/` | Upstream's pnpm workspace. Packages keep their `@instantdb/*` names | here |
| `swift/instant-data-swift/` | The Swift package, with its history | planned |
| `rust/` | The Rust crates, as one Cargo workspace with unchanged crate names | planned |
| `protocol/fixtures/` | Wire fixtures that every client's tests read | planned |

Until a planned folder exists here, that library still lives in its own repository.

## How upstream is merged

Upstream is merged, never rebased, so commits that are on `main` keep their hashes:

    git fetch upstream
    git merge upstream/main        # into main
    # run both test suites (below) before pushing

- Never rebase `main` and never force-push it.
- Keep our changes to upstream's files small and in as few places as possible, so merges stay easy.
- Do not edit upstream's workflow files to switch things off; see the next section.

## GitHub Actions

Upstream's workflows publish npm packages, a Python package and Docker images, and deploy upstream's own services
when `main` moves. None of that may run from a fork. Keep GitHub Actions turned off in this repository's settings
(Settings, Actions, "Disable actions"), and leave the workflow files as upstream wrote them so merges stay clean.
Tests are run locally:

    make -C server test                        # needs the Clojure CLI, a JDK and a migrated Postgres on localhost:5432
    pnpm -C client test                        # every client package
    pnpm -C client/packages/core test:ci       # @instantdb/core alone

## Releases

Nothing is published from this fork to npm, PyPI or a container registry under Instant's names. Planned: builds of
our `@instantdb/*` packages attached to GitHub releases of this fork as tarballs, and namespaced tags
(`ts/vX.Y.Z-tp.N`, `swift/vX.Y.Z`, `rust/vX.Y.Z`). Upstream has no tags, so nothing collides.

## Keeping it public-safe

This repository is public. Commits, messages and files here hold no issue numbers or links from private trackers, no
home-folder paths, machine names or personal email addresses, no real app ids and no tokens. Commit with a GitHub
noreply address. References to upstream's pull requests are written in full (`instantdb/instant#1234`).
