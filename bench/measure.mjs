// Single-run measurement: wall-clock, heap delta, peak RSS.
//
// Requires Node started with --expose-gc.

import {performance} from 'node:perf_hooks'

function gc() {
  if (typeof global.gc === 'function') global.gc()
}

function startPeakSampler() {
  let peak = 0
  let stopped = false

  const sample = () => {
    if (stopped) return
    const rss = process.memoryUsage().rss
    if (rss > peak) peak = rss
    setImmediate(sample)
  }

  // Prime with current value, then start the loop.
  peak = process.memoryUsage().rss
  setImmediate(sample)

  return {
    stop() {
      stopped = true
      // One final sample to catch any tail.
      const rss = process.memoryUsage().rss
      if (rss > peak) peak = rss
      return peak
    }
  }
}

// Run `fn` once and return measurements. Caller is responsible for calling gc
// before invoking; we sample memory immediately on entry so the caller's gc
// covers the baseline.
export function measureOnce(fn) {
  gc()
  const memBefore = process.memoryUsage()
  const sampler = startPeakSampler()

  let result
  let error
  const tStart = performance.now()
  try {
    result = fn()
  } catch (e) {
    error = e
  }
  const tEnd = performance.now()

  const peakRss = sampler.stop()
  const memAfter = process.memoryUsage()

  return {
    elapsedMs: tEnd - tStart,
    heapDeltaBytes: memAfter.heapUsed - memBefore.heapUsed,
    peakRssDeltaBytes: peakRss - memBefore.rss,
    error,
    result
  }
}

// Statistics helpers.
export function median(values) {
  if (values.length === 0) return NaN
  const sorted = values.slice().sort((a, b) => a - b)
  const m = sorted.length >>> 1
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2
}

export function percentile(values, p) {
  if (values.length === 0) return NaN
  const sorted = values.slice().sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

// Drop one min and one max, return what's left.
export function trimExtremes(values) {
  if (values.length <= 2) return values.slice()
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted.slice(1, -1)
}

export function geometricMean(values) {
  const filtered = values.filter(v => v > 0 && Number.isFinite(v))
  if (filtered.length === 0) return NaN
  let sumLog = 0
  for (const v of filtered) sumLog += Math.log(v)
  return Math.exp(sumLog / filtered.length)
}
