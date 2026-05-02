# Performance and memory review of PR #50

**Subject:** [`syntax-tree/mdast-util-from-markdown#50`](https://github.com/syntax-tree/mdast-util-from-markdown/pull/50) — *Fix O(n²) complexity in `prepareList`*

| | |
| --- | --- |
| Baseline | `main` @ `f9ef1b3` (v2.0.3) |
| PR | `pr-50` @ `adecc18` |
| Node | `v24.15.0`, linux/x64 |
| Inputs | 786 across 4 classes (lists, pathological, real-docs, fuzz) |
| Runs / `(input, impl)` | 11 (B/P interleaved; min and max trimmed) |
| Wall-clock | 160.8 s |
| Verdict | **Mixed** — headline claim confirmed; net regression on nested lists and small inputs |

---

## TL;DR

The PR delivers exactly the speedup it advertises on its target case, including a **31.9 % wall-clock reduction on a synthetic stand-in for the GitHub Docs GraphQL reference page** (442 ms → 301 ms). On large flat lists the speedup is even larger: 38.5 % on 10 000-item lists.

But the rewrite has measurable cost at smaller scales and on shapes the original code handled better. **Nested lists regress 5–15 % across every size measured** (100, 500, 1 000, 2 500 items), and the all-of-CommonMark-spec concatenation regresses 8.9 %. Memory is essentially flat: the deferred-merge approach does not blow up heap (heap delta geomean across real-docs is 1.001), and peak RSS differences are at the KB level.

The PR is a clear win for the GitHub Docs use case and other large-list scenarios. Whether it is the right trade for the wider corpus depends on how the maintainers weight "rare-but-bad" against "common-and-mildly-slower."

---

## Headline numbers

Geometric mean of `pr / baseline` per input class. Values < 1.0 mean the PR is faster / uses less. Heap and peak-RSS columns are at the KB granularity at which `process.memoryUsage()` reports.

| class | inputs | time | heap | peak rss |
| --- | ---:| ---:| ---:| ---:|
| lists | 20 | **0.932** | 0.967 | 1.252 |
| pathological | 10 | 0.996 | 1.002 | 1.051 |
| real-docs | 656 | 1.004 | 1.001 | 1.222 |
| fuzz | 100 | 1.009 | 1.002 | — |

Reading: **lists are 6.8 % faster on average. Pathological and real-docs are statistically flat.** The peak-RSS column has heavy noise — most small inputs report 0 KB peak (parse fits in already-allocated memory), so the geomean is dominated by a handful of larger inputs and is not a reliable signal at this granularity. Heap delta is the cleaner memory metric and shows no movement.

---

## Where the PR wins

These are inputs with baseline time ≥ 10 ms, where measurement noise is small relative to the effect. Sorted by time ratio (best → worst).

| input | size | base (ms) | pr (ms) | ratio | comment |
| --- | ---:| ---:| ---:| ---:| --- |
| `lists/flat-ordered-10000` | 158 KB | 410.3 | 252.5 | **0.615** | headline win on the 10 k-item case |
| `lists/flat-unordered-10000` | 119 KB | 392.6 | 253.4 | **0.645** | same shape |
| `real-docs/gh-docs-reference-6.4k` | 413 KB | 442.4 | 301.3 | **0.681** | the GitHub Docs scenario from issue #49 |
| `lists/flat-ordered-5000` | 78 KB | 174.0 | 127.7 | 0.734 | |
| `lists/paragraph-per-item-100` | 10 KB | 6.6 | 5.2 | 0.797 | rare small-input win |
| `real-docs/gh-docs-reference-3k` | 193 KB | 176.8 | 146.1 | 0.827 | |
| `lists/flat-unordered-5000` | 59 KB | 150.5 | 126.3 | 0.840 | |
| `lists/flat-ordered-2500` | 38 KB | 84.0 | 77.4 | 0.921 | |

The shape of the speedup curve matches the algorithmic claim: the ratio approaches 0 as N grows because the original code is `O(n²)` and the PR is `O(n)`. At N = 10 000, the splice-shift cost dominates everything else parsing does, which is why the saving is so large.

---

## Where the PR regresses

Same filter (baseline ≥ 10 ms), sorted by ratio worst-first.

| input | size | base (ms) | pr (ms) | ratio | comment |
| --- | ---:| ---:| ---:| ---:| --- |
| `lists/nested-unordered-100` | 4 KB | 13.3 | 15.4 | **1.155** | nested lists are the consistent regression |
| `lists/flat-ordered-1000` | 14 KB | 30.4 | 34.0 | 1.119 | flat list at 1 k items got slower |
| `lists/nested-unordered-500` | 21 KB | 58.4 | 65.0 | 1.114 | |
| `pathological/attention-runs-100` | 40 KB | 11.6 | 12.6 | 1.089 | unrelated code path |
| `real-docs/commonmark-spec/concat` | 16 KB | 35.2 | 38.4 | 1.089 | full spec concatenated |
| `lists/nested-unordered-2500` | 112 KB | 323.4 | 346.9 | 1.073 | |
| `lists/nested-unordered-1000` | 43 KB | 126.7 | 133.2 | 1.052 | |

The pattern across the four nested-list sizes (100 / 500 / 1 000 / 2 500) is the most actionable signal here. Every size regresses, with the ratio holding roughly steady around 1.05–1.15. That means nested lists are not a small-N artifact: the new code is consistently a few percent slower on this shape across all sizes tested.

`real-docs/commonmark-spec/concat` is also worth attention — it is the closest thing in the corpus to "a real document" rather than a synthetic, and it regresses 8.9 %.

---

## Sub-millisecond noise band (the other 85 regressions)

The pass/fail gate also flagged 85 inputs whose baseline time is below 1 ms — almost entirely individual CommonMark spec examples and tiny fuzz seeds. Distribution of all 92 flagged regressions by baseline time bucket:

| baseline time | flagged | reading |
| --- | ---:| --- |
| < 1 ms | 85 | timer noise dominates; even with median-of-9 + p95-required-too, +5 % is ~50 µs at this scale |
| 1–10 ms | 0 | clean band |
| ≥ 10 ms | 7 | the table above; real findings |

In other words, **the gate's noise floor is the sub-millisecond range on this hardware**, not the algorithm. A single-digit-percent shift on a 0.2 ms parse is one cache miss. I'd recommend filtering the strict gate to inputs with baseline ≥ 1 ms before treating the count of failures as a quality bar.

---

## Memory profile

Heap delta is the trustworthy memory measurement here; peak RSS is sampled at `setImmediate` cadence and resolves at KB granularity, so any input that fits comfortably in already-allocated memory reports 0 and the ratio is undefined or noisy.

For inputs large enough to actually grow the heap:

| input | heap base (KB) | heap pr (KB) | Δ |
| --- | ---:| ---:| ---:|
| `lists/flat-ordered-10000` | 164 865 | 136 055 | **−28.8 MB** |
| `lists/flat-unordered-10000` | 135 519 | 138 150 | +2.6 MB |
| `lists/flat-unordered-5000` | 115 637 | 67 714 | **−47.9 MB** (from latest run; lists-only run was −48 MB too — repeatable) |
| `real-docs/gh-docs-reference-6.4k` | 124 282 | 124 837 | +0.5 MB |
| `pathological/nested-blockquotes-500` | 289 429 | 289 413 | −0.02 MB |

The PR is **not** holding the deferred-insertion arrays as a lasting cost. After GC the resulting parse tree is the same size or smaller; in two of the largest list cases the PR uses *less* memory than baseline (the deferred-merge version produces less intermediate garbage during parse, which means less max heap usage at GC checkpoints). The "list-class heap geomean = 0.967" headline reflects this.

Peak RSS values for the large list and gh-docs inputs are within ±1 % of baseline, which is below the noise floor of `process.memoryUsage().rss` sampling.

---

## Methodology

For each `(input, impl)`:

1. `global.gc()` (Node started with `--expose-gc`).
2. Snapshot `heapUsed` and `rss`.
3. Start a `setImmediate`-driven peak-RSS sampler.
4. `performance.now()` → `fromMarkdown(text)` → `performance.now()`.
5. Stop sampler. Snapshot heap and RSS after.

Runs are interleaved: B P B P … B P (11 of each). Per `(input, impl)` we drop the highest and lowest, then take median + p95 over the remaining 9.

Hard ceilings per run: 30 s wall-clock, 1 GiB heap delta. None hit on this run.

I did **not** use Benchmark.js, mitata, or tinybench. Those are tuned for sub-millisecond microbenchmarks where measurement overhead dominates; this workload is in the millisecond-to-second range where wall-clock noise is the constraint, and none of them sample memory mid-run or do paired-impl comparison the way this needed.

The bench harness, including reproduction commands, lives at [`bench/`](.) in the repo. After running `npm run bench`, the latest CSV is at `bench/out/latest.csv` and the auto-generated structured summary at `bench/out/latest.md`. Those files are not committed; they regenerate on every run.

---

## Recommendation

The PR is worth landing for the workload it targets. The 32 % saving on the GitHub Docs page shape (issue #49) is the marquee result, and the 38 % saving on 10 k-item lists confirms the asymptotic claim.

Before landing, I'd want either an answer or a measurement on three things:

1. **Why do nested lists regress?** The pattern is consistent across four sizes — that smells like algorithmic, not noise. The new backward-merge pass walks `events` once more than the original splice approach; on inputs where `prepareList` is invoked many times (each nesting level triggers it) the constant-factor overhead of building two arrays and doing the merge pass might outweigh the splice savings when each call only has a handful of items to insert.
2. **Why does flat-ordered-1000 regress while flat-ordered-2500 already wins?** The crossover point matters. If the PR is a net loss below ~1 500 items and a net win above, that's a reasonable trade for most real workloads. If the regression is shape-specific rather than size-specific, that's worth understanding before merge.
3. **Is `commonmark-spec/concat` representative?** That is the closest thing in this corpus to "real markdown" rather than synthetic shapes. Its 8.9 % regression is small but real. It might be that this concatenation has many small lists, in which case it tells the same story as nested-unordered-100 — many `prepareList` calls each with few items.

A small follow-up — only invoke the new merge-pass branch when `insertCount` exceeds some threshold (say 4 or 8) and fall back to the original splice loop otherwise — would likely turn every regression here into a tie while keeping the big-N wins. Worth measuring before requesting it on the PR.

---

## How to reproduce

From the repo root:

```sh
npm install
npm run bench-setup              # creates bench/.baseline (main) and bench/.pr (pr-50) worktrees
npm run bench                    # full run, ~3 minutes on this hardware
npm run bench -- --inputs=lists  # subset
npm run bench -- --swap          # debug: swap impls, gate should now FAIL loudly
npm run bench-teardown
```

Outputs land in `bench/out/`:

- `results-<timestamp>.csv` — one row per `(input, impl)`.
- `summary-<timestamp>.md` — auto-generated headline tables.
- `latest.csv`, `latest.md` — symlinks to most recent run.

This file (`report.md`) is the human-written narrative — not auto-generated and not refreshed by the bench. Re-run the bench, then re-write this if the underlying numbers change.
