# Fork notes — patrickdundas/tracker-tracker

Fork of [jordanlambrecht/tracker-tracker](https://github.com/jordanlambrecht/tracker-tracker)
(GPL-3.0), maintained for Patrick's homelab. Deployed on the `yams` VM at
`http://192.168.8.199:3838`; see `docs/tracker-stats.md` in the `homelab-agent` repo.

## Why this fork exists

TorrentLeech hit-and-run tracking. TL has no public API, so stats come from scraping the logged-in
profile page — and upstream's TL adapter (via PR #175) stubs `hitAndRuns: null`. HnR visibility
across trackers is the whole reason this dashboard was deployed, so that gap is the fork's purpose.

## Branch strategy

| Branch | Role |
|---|---|
| `main` | **Integration + deploy branch.** `release.yml` triggers on push here and publishes to `ghcr.io/patrickdundas/tracker-tracker`. Upstream is merged *into* this. |
| `feat/*` | Work branches. PR into `main` so `ci.yml` runs before anything publishes. |

`main` deliberately is *not* a clean upstream mirror: the release workflow only builds from `main`,
so that is where deployable code has to live. To contribute something back upstream, branch from
`upstream/main` directly rather than from our `main`.

```bash
git remote -v
# origin    git@github.com:patrickdundas/tracker-tracker.git
# upstream  https://github.com/jordanlambrecht/tracker-tracker.git

# sync with upstream
git fetch upstream && git merge upstream/main
```

## Versioning

`release.yml` publishes only when `package.json`'s version has no matching GitHub Release, so
**every deployable change needs a version bump** or no image is built.

This fork uses a `-homelab.N` suffix (`2.8.9-homelab.1`) so builds are unambiguously ours and never
collide with an upstream release tag. On an upstream sync, `package.json` will conflict on this one
line — resolve to the new upstream base plus a reset suffix, e.g. `2.9.0-homelab.1`.

## Deltas from upstream

| Change | Status |
|---|---|
| Upstream PR #175 merged whole (Zenith, BTN fix, IPTorrents, TorrentLeech adapters) | done — see below |
| `checkHnrSustained` — HnR alerts require an increase to hold N polls (2.8.9-homelab.5) | done; **worth upstreaming** |
| TorrentLeech `hitAndRuns` | **the point of the fork**, not yet implemented |
| TorrentLeech `requiredRatio` / `warned` | stubbed `null` upstream; `warned` feeds the `warned` notification event |

**On taking #175 whole rather than extracting only TorrentLeech:** all four adapters touch the same
shared files (`src/lib/adapters/index.ts`, `adapters/constants.ts`, `lib/parser.ts`). Cherry-picking
TL alone would leave this fork carrying divergent copies of those, guaranteeing conflicts when
upstream merges #175. Taken whole, that merge becomes a no-op. The unused adapters never execute
unless those trackers are configured.

## Hit-and-run alerts are debounced (2.8.9-homelab.5)

Upstream's `checkHnrIncrease` fires the moment the counter rises above the previous poll. That
assumes the tracker's HnR figure is a permanent strike record. On TorrentLeech it is not — it is a
**live "not currently satisfying" count**, and stale tracker-side leech records age out through it.

Measured over 11 days of hourly polls on this deployment: four separate `0 -> 1 -> 0` blips, runs of
5, 4, 2 and 4 polls, every one self-cleared. Four alerts, four false alarms.

`checkHnrSustained` requires the rise to hold for `thresholds.hnrSustainedPolls` consecutive polls
(default **6** — the smallest value that suppresses all four) and fires exactly once, on the poll
where the run completes. A real hit-and-run is a recorded penalty that never clears, so the cost is
only a few hours of notice on something already irreversible.

Two details worth keeping if this is ever rewritten:

- The threshold is **clamped** to `HNR_SUSTAINED_POLLS_MAX`. Unclamped, a value larger than the
  fetched history could never be satisfied, and "never fires" is indistinguishable from "no HnRs".
- `pollTracker` now selects `HNR_HISTORY_POLLS` snapshots instead of 1. Only the HnR check reads the
  extra rows; every other comparison still uses `previousSnapshot`.

## Only credential failures pause a tracker (2.8.9-homelab.7)

Upstream auto-pauses a tracker after `POLL_FAILURE_THRESHOLD` (4) consecutive failures, whatever
the cause, and a paused tracker only resumes when someone clicks Resume. Two details make that far
more fragile than it looks:

- A failed poll leaves `lastPolledAt` untouched, so a failing tracker is permanently "overdue" and
  is retried on **every 5-minute scheduler tick**, not on the hourly poll interval.
- Four ticks is therefore **20 minutes**. Any outage longer than that pauses the tracker for good.

On 2026-08-16 a home internet outage did exactly that to all six trackers at once. Nothing resumed
them. The container stayed up the whole time, so the container-level health check stayed green and
the fault went unnoticed for **33.5 hours** — during which the MyAnonaMouse balance hit its 99,999
point cap and burned roughly 5,000 points, about 10 GiB of upload credit.

`src/lib/poll-failure-policy.ts` inverts the default. Only a failure a human must actually fix —
`Authentication failed`, `Session expired`, `Invalid credentials` — can set `pausedAt`. Everything
else keeps counting failures, so the UI still shows the fault, but is retried forever under
exponential backoff: 5m, 10m, 20m, 40m, then hourly. Connectivity problems now heal by themselves
within an hour of the network returning.

Details worth keeping in a rewrite:

- Classification runs on the **output of `sanitizeNetworkError`**, not the raw error, so it matches
  a small fixed set of phrases rather than guessing at driver-specific text. The unclassified
  fallback `"Poll failed"` is deliberately transient — that is what the real outage produced, and
  treating an unknown error as permanent is what caused the incident.
- Rate-limit and IP-ban errors are transient but jump **straight to the 60-minute cap**, since
  retrying at the normal cadence is what provokes them.
- On the transient path `pausedAt` is set to the **column reference** (`paused_at = paused_at`), a
  no-op self-assign. It must never be a literal, which would clobber a genuine pause.
- The backoff gate lives in the `pollAllTrackers` overdue filter, keyed off `lastErrorAt`. Without
  it, removing the pause would mean retrying every 5 minutes forever.

The dashboard side of this incident is fixed separately, in the homelab repo — a heartbeat sender
that alerts on **snapshot staleness** rather than container liveness, since liveness was never the
thing worth watching.

## Workflow edits (the main sync-conflict surface)

`.github/workflows/release.yml` is patched. Upstream's version **cannot publish from a fork** —
these are not preferences, they are blockers:

| Change | Why |
|---|---|
| Removed "Log in to Docker Hub" step | No `DOCKERHUB_*` secrets here. `docker/login-action` fails on empty credentials, aborting the job **before** the build/push step ever ran. |
| Removed `docker.io/jordyjordy/*` image tags | That is upstream's Docker Hub namespace; this fork has no rights to push there, so `build-push` failed. GHCR only now — `IMAGE_NAME` already resolves to our own repo path. |
| Removed "Sync README to Docker Hub" step | Same missing secrets, and it targets upstream's Docker Hub repo. |
| Trivy `exit-code: "0"` + `if: always()` on the SARIF upload | The image is pushed *before* the scan runs, so a hard failure never prevented a vulnerable image shipping — it only skipped the SARIF upload and the GitHub Release, leaving the run permanently red and the findings invisible in the Security tab. Non-blocking puts them where they can be acted on. |
| `platforms: linux/amd64` only, QEMU setup step removed | The single deploy target (yams) is x86_64. arm64 was emulated under QEMU for an image nothing pulls, and emulation is several times slower than native. Re-add both if an ARM host ever needs this. |
| **Cache scope fix** — `cache-from`/`cache-to` both `buildx-amd64` | Upstream wrote `cache-to: scope=buildx-<version>` but read `cache-from: scope=buildx-amd64,buildx-arm64`. The scopes never matched, so **no release ever read a cache entry another release wrote** — every build was cold, and each left a version-scoped entry nothing would read again. Worth upstreaming. |

### Release build time

The Docker build step was **989s of an 18m25s run** — every other step totalled ~90s. Both changes
above target that one step: dropping the emulated arm64 half, and making the layer cache actually
hit on subsequent builds.

Because this file is modified, **review `git diff upstream/main -- .github/` on every sync** and
re-apply these if upstream rewrites the release job. Reviewing that diff is worth doing regardless:
merging upstream runs *their* workflow code with this repo's `contents: write` and `packages: write`
token.

## Fixed: devDependencies no longer ship in the production image

**Was:** the `schema-deps` Dockerfile stage ran a full `pnpm install` (devDependencies included) and
the runner stage copied that `node_modules` in for the drizzle-kit schema push. vitest's entire
dependency tree — vite, jsdom, undici, typescript — landed in the production image, and Trivy
flagged all of it.

**Now:** that stage installs with `--prod`. `drizzle-kit`, `drizzle-orm` and `postgres` all live in
`dependencies`, and drizzle-kit vendors its own esbuild/tsx, so the startup schema push still has
everything it needs. `drizzle.config.ts` already guarded its `dotenv` require in a try/catch for
exactly this case. The stage also strips the `prepare` script before installing, because `prepare`
runs husky — a devDependency that `--prod` correctly does not install.

Verified by building the image and running `docker-entrypoint.sh` against a throwaway Postgres:
16 tables created, `/api/health` returned `{"status":"ok","db":"connected"}`. Image dropped
866 MB to 671 MB, and the runner's schema-sync tree went from the full dependency graph to 29
top-level packages.

Consequence worth remembering: anything that must exist at container startup has to be a real
`dependency`. A new startup requirement that lives in `devDependencies` will now break deploys, not
just builds.

Known non-blocking CI failures on this fork:

- **Scan Dependencies** (`dependency-review-action`) — needs Dependency Graph, which GitHub disables
  by default on forks. Enable under Settings → Code security, or ignore.
- **`pnpm audit`** still reports `vite` CVE-2026-53571, because vitest 4.1.4 holds vite at 7.3.2 in
  the lockfile and neither `overrides` nor `--force` re-resolves it. Advisory-only — the gate that
  matters is the Trivy image scan, and vite is no longer in the image.

### Known upstream quirk: sharp is not resolvable at runtime

`next build` with `output: "standalone"` traces sharp into `/app/node_modules/.pnpm/`, but never
creates the top-level `node_modules/sharp` symlink, so `require("sharp")` fails inside the container
and Next silently falls back to serving `/_next/image` requests unoptimised. Pre-existing and
version-independent — not caused by the sharp override. Fixing it means copying sharp explicitly in
the runner stage; nothing depends on it today.

## One-time setup gotcha

GitHub **disables workflows on forks by default**. `total_count` from
`/repos/:owner/:repo/actions/workflows` reads 0 and nothing runs until they are enabled once from
the repo's Actions tab. There is no REST endpoint for this.
