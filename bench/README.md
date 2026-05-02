# bench/

Perf and memory bench for `mdast-util-from-markdown` PR #50
([syntax-tree/mdast-util-from-markdown#50](https://github.com/syntax-tree/mdast-util-from-markdown/pull/50)).

The bench compares the current `main` branch (baseline) against PR #50 (which
rewrites `prepareList` to fix the O(n²) per-list-item splice behavior). It
runs a paired, interleaved measurement across four input classes, reports
median wall-clock, heap delta, and peak RSS, and exits non-zero on any
regression.

## Quick start

```sh
npm install                           # once, in the repo root
npm run bench-setup                   # creates bench/.baseline and bench/.pr
npm run bench -- --runs=3 --inputs=lists   # ~60s smoke test
npm run bench                         # full run (default --runs=11, all classes)
```

Outputs land in `bench/out/`:

- `results-<timestamp>.csv` — one row per `(input, impl)` with raw numbers.
- `summary-<timestamp>.md` — headline ratios per class, top regressions /
  wins, and the explicit list of failing inputs.
- `latest.csv`, `latest.md` — symlinks to the most recent run.

## CLI flags

| flag | default | meaning |
| --- | --- | --- |
| `--runs=N` | `11` | runs per `(impl, input)`; high and low are trimmed before median |
| `--inputs=a,b,c` | all | classes to enable: `lists`, `pathological`, `fuzz`, `real-docs` |
| `--config=name` | `commonmark` | which fuzz-corpus subdir to draw from |
| `--fuzz-limit=N` | `200` | cap on number of fuzz-corpus inputs (corpus is ~1.5k) |
| `--out=path` | `bench/out` | where to write CSV + summary |
| `--swap` | off | swap which side is "baseline" vs "pr"; gate should then FAIL |

`--swap` is a debug knob: it inverts the impls so the bench measures `pr` as
"baseline" and `main` as "pr". The list-gate and per-input regression checks
should then fire and the process should exit non-zero — confirms the gate
logic is alive.

## Input classes

- **lists** — synthetic flat / nested / paragraph-per-item lists at sizes
  100..10000. Where the PR is expected to win and where the curve shape
  (n vs n²) is visible.
- **pathological** — tables, blockquotes, code fences, attention runs, many
  headings, many paragraphs. Confirms the change does not regress code paths
  it should not touch.
- **fuzz** — files from a sibling `remark-fuzz/corpus/<config>/` directory.
  Path is overridable via `BENCH_FUZZ_CORPUS=` env. Defaults to
  `../remark-fuzz/corpus`.
- **real-docs** — every CommonMark spec example, the spec concatenated, and
  GitHub-Docs-shaped reference pages at three scales (1k / 3k / 6.4k items).

## Methodology

For each `(input, impl)`:

1. `global.gc()` (requires `node --expose-gc`).
2. Snapshot `heapUsed` and `rss`.
3. Start a `setImmediate`-driven peak-RSS sampler.
4. `performance.now()` → call `fromMarkdown(text)` → `performance.now()`.
5. Stop sampler. Snapshot heap and RSS after.

Runs are interleaved: B P B P ... so JIT and OS noise affect both sides
equally. Per `(input, impl)` we collect K runs (default 11), trim the highest
and lowest, then take median + p95 over the remaining 9.

Hard ceilings per run: 30 s wall-clock, 1 GiB heap delta. Inputs that exceed
either are recorded as `*-failed`.

## Pass criteria (strict)

The bench exits non-zero if any of the following holds:

- **Per-input time**: any input where `time_pr_median > time_baseline × 1.05`
  AND `time_pr_p95 > time_baseline × 1.05`. Both required so a single noisy
  median doesn't trip the gate.
- **Per-input heap**: any input where `heap_pr_median` exceeds
  `max(heap_baseline × 1.05, heap_baseline + 1 MiB)`. The MiB floor avoids
  tripping on tiny inputs.
- **Per-input peak RSS**: same shape, with a 4 MiB floor.
- **List-class win required**: across heavy-list rows (N >= 1000),
  `geomean(time_pr / time_baseline) <= 0.85`. The PR's reason to exist —
  if it doesn't deliver here, fail.

## Reading the summary

`summary-<timestamp>.md` opens with the verdict, then per-class headline
ratios (geometric mean of pr/baseline), then the list-class gate, then the
top 15 worst time ratios (regressions float to the top), the top 15 best,
and finally an explicit Regressions section listing each failing input with
the reason.

A row reads: ratio < 1.0 means the PR is faster / uses less. > 1.0 means
slower / more.

## Cloning a fork

If you cloned a fork rather than `syntax-tree/mdast-util-from-markdown`,
the PR refs live on the upstream remote, not on your fork. Add upstream
and point the setup script at it:

```sh
git remote add upstream git@github.com:syntax-tree/mdast-util-from-markdown.git
BENCH_PR_REMOTE=upstream npm run bench-setup
```

## Teardown

```sh
npm run bench-teardown
```

Removes both worktrees and the local `pr-50` branch ref.
