// Paired baseline-vs-PR measurement, interleaved per-run to suppress
// order-dependent JIT and OS noise.

import {measureOnce, median, percentile, trimExtremes} from './measure.mjs'

const HARD_TIMEOUT_MS = 30000
const HARD_HEAP_DELTA_BYTES = 1024 * 1024 * 1024 // 1 GiB

async function loadParse(implPath) {
  const mod = await import(implPath)
  if (typeof mod.fromMarkdown !== 'function') {
    throw new Error(`expected fromMarkdown export from ${implPath}`)
  }
  return mod.fromMarkdown
}

async function warmup(parse) {
  const tiny = '* a\n* b\n* c\n'
  for (let i = 0; i < 3; i++) parse(tiny)
}

function summarize(samples) {
  if (samples.length === 0) {
    return {timeMedianMs: NaN, timeP95Ms: NaN, heapDeltaMedian: NaN, peakRssDeltaMedian: NaN}
  }
  const elapsed = samples.map(s => s.elapsedMs)
  const heap = samples.map(s => s.heapDeltaBytes)
  const peak = samples.map(s => s.peakRssDeltaBytes)
  const trimmedElapsed = trimExtremes(elapsed)
  const trimmedHeap = trimExtremes(heap)
  const trimmedPeak = trimExtremes(peak)
  return {
    timeMedianMs: median(trimmedElapsed),
    timeP95Ms: percentile(trimmedElapsed, 95),
    heapDeltaMedian: median(trimmedHeap),
    peakRssDeltaMedian: median(trimmedPeak)
  }
}

// Run one input through both impls, interleaving runs.
async function runInputPair({input, baseline, pr, runs, swap, log}) {
  const baselineSamples = []
  const prSamples = []
  let baselineFailed = false
  let prFailed = false

  for (let i = 0; i < runs; i++) {
    const order = (swap ? i % 2 === 1 : i % 2 === 0) ? ['baseline', 'pr'] : ['pr', 'baseline']
    for (const side of order) {
      const parse = side === 'baseline' ? baseline : pr
      const sink = side === 'baseline' ? baselineSamples : prSamples

      const m = measureOnce(() => parse(input.text))
      if (m.error) {
        if (side === 'baseline') baselineFailed = true
        else prFailed = true
        continue
      }
      if (m.elapsedMs > HARD_TIMEOUT_MS || m.heapDeltaBytes > HARD_HEAP_DELTA_BYTES) {
        if (side === 'baseline') baselineFailed = true
        else prFailed = true
        if (log) log(`  ${input.name}: ${side} hit ceiling (t=${m.elapsedMs.toFixed(0)}ms heap=${m.heapDeltaBytes})`)
        continue
      }
      sink.push(m)
    }
  }

  const baselineSummary = summarize(baselineSamples)
  const prSummary = summarize(prSamples)

  return {
    input: {class: input.class, name: input.name, sizeBytes: Buffer.byteLength(input.text, 'utf8')},
    runs: {baseline: baselineSamples.length, pr: prSamples.length},
    baseline: baselineSummary,
    pr: prSummary,
    status: baselineFailed && prFailed ? 'both-failed'
      : baselineFailed ? 'baseline-failed'
      : prFailed ? 'pr-failed'
      : 'ok'
  }
}

export async function compareImplementations({inputs, baselinePath, prPath, runs, swap, log}) {
  const baselineParse = await loadParse(baselinePath)
  const prParse = await loadParse(prPath)

  // Warm both to settle initial JIT.
  await warmup(baselineParse);
  await warmup(prParse)

  const list = Array.isArray(inputs) ? inputs : Array.from(inputs)
  const results = []
  for (let i = 0; i < list.length; i++) {
    const input = list[i]
    if (log) log(`[${i + 1}/${list.length}] ${input.class}/${input.name} (${input.text.length} chars)`)
    const row = await runInputPair({input, baseline: baselineParse, pr: prParse, runs, swap, log})
    results.push(row)
  }

  return results
}
