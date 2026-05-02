// Emit CSV + markdown summary, decide pass/fail.

import {writeFileSync, mkdirSync, symlinkSync, unlinkSync, existsSync} from 'node:fs'
import {join, resolve, dirname} from 'node:path'
import {geometricMean} from './measure.mjs'

const TIME_REG_RATIO = 1.05
const HEAP_REG_RATIO = 1.05
const HEAP_FLOOR_BYTES = 1 * 1024 * 1024 // 1 MiB
const PEAK_REG_RATIO = 1.05
const PEAK_FLOOR_BYTES = 4 * 1024 * 1024 // 4 MiB
const LIST_GEOMEAN_TARGET = 0.85
const LIST_MIN_N = 1000

function fmtMs(v) { return Number.isFinite(v) ? v.toFixed(3) : '' }
function fmtKb(v) { return Number.isFinite(v) ? (v / 1024).toFixed(1) : '' }
function fmtRatio(v) { return Number.isFinite(v) ? v.toFixed(3) : '' }

function ratio(prValue, baselineValue) {
  if (!Number.isFinite(prValue) || !Number.isFinite(baselineValue) || baselineValue === 0) return NaN
  return prValue / baselineValue
}

function classifyRegression(row) {
  const reasons = []
  const tRatio = ratio(row.pr.timeMedianMs, row.baseline.timeMedianMs)
  const tP95Ratio = ratio(row.pr.timeP95Ms, row.baseline.timeP95Ms)
  if (Number.isFinite(tRatio) && Number.isFinite(tP95Ratio) &&
      tRatio > TIME_REG_RATIO && tP95Ratio > TIME_REG_RATIO) {
    reasons.push(`time +${((tRatio - 1) * 100).toFixed(1)}% (median) / +${((tP95Ratio - 1) * 100).toFixed(1)}% (p95)`)
  }

  const heapPr = row.pr.heapDeltaMedian
  const heapBase = row.baseline.heapDeltaMedian
  if (Number.isFinite(heapPr) && Number.isFinite(heapBase)) {
    const allowed = Math.max(heapBase * HEAP_REG_RATIO, heapBase + HEAP_FLOOR_BYTES)
    if (heapPr > allowed && heapPr - heapBase > HEAP_FLOOR_BYTES) {
      reasons.push(`heap +${((heapPr - heapBase) / 1024).toFixed(1)}KB`)
    }
  }

  const peakPr = row.pr.peakRssDeltaMedian
  const peakBase = row.baseline.peakRssDeltaMedian
  if (Number.isFinite(peakPr) && Number.isFinite(peakBase)) {
    const allowed = Math.max(peakBase * PEAK_REG_RATIO, peakBase + PEAK_FLOOR_BYTES)
    if (peakPr > allowed && peakPr - peakBase > PEAK_FLOOR_BYTES) {
      reasons.push(`peakRss +${((peakPr - peakBase) / 1024 / 1024).toFixed(2)}MiB`)
    }
  }

  return reasons
}

export function buildSummary(results) {
  const byClass = new Map()
  for (const row of results) {
    if (!byClass.has(row.input.class)) byClass.set(row.input.class, [])
    byClass.get(row.input.class).push(row)
  }

  const classStats = []
  for (const [cls, rows] of byClass.entries()) {
    const timeRatios = rows
      .map(r => ratio(r.pr.timeMedianMs, r.baseline.timeMedianMs))
      .filter(v => Number.isFinite(v) && v > 0)
    const heapRatios = rows
      .map(r => ratio(r.pr.heapDeltaMedian, r.baseline.heapDeltaMedian))
      .filter(v => Number.isFinite(v) && v > 0)
    const peakRatios = rows
      .map(r => ratio(r.pr.peakRssDeltaMedian, r.baseline.peakRssDeltaMedian))
      .filter(v => Number.isFinite(v) && v > 0)

    classStats.push({
      class: cls,
      count: rows.length,
      timeGeomean: geometricMean(timeRatios),
      heapGeomean: geometricMean(heapRatios),
      peakGeomean: geometricMean(peakRatios)
    })
  }

  // List-class win check: only on flat lists with N >= LIST_MIN_N items.
  const heavyListRows = (byClass.get('lists') || []).filter(r => {
    const m = r.input.name.match(/-(\d+)$/)
    return m && Number(m[1]) >= LIST_MIN_N
  })
  const heavyListRatios = heavyListRows
    .map(r => ratio(r.pr.timeMedianMs, r.baseline.timeMedianMs))
    .filter(v => Number.isFinite(v) && v > 0)
  const listGeomean = geometricMean(heavyListRatios)

  const failures = []
  for (const row of results) {
    const reasons = classifyRegression(row)
    if (reasons.length > 0) failures.push({row, reasons})
  }

  const listGate = {
    target: LIST_GEOMEAN_TARGET,
    actual: listGeomean,
    rows: heavyListRows.length,
    pass: heavyListRows.length > 0 && Number.isFinite(listGeomean) && listGeomean <= LIST_GEOMEAN_TARGET
  }

  const pass = failures.length === 0 && listGate.pass

  return {results, classStats, failures, listGate, pass}
}

export function writeCsv(path, results) {
  const header = [
    'class', 'name', 'size_bytes', 'runs_baseline', 'runs_pr',
    'time_baseline_median_ms', 'time_pr_median_ms', 'time_ratio',
    'time_baseline_p95_ms', 'time_pr_p95_ms',
    'heap_baseline_median_kb', 'heap_pr_median_kb',
    'peak_rss_baseline_median_kb', 'peak_rss_pr_median_kb',
    'status'
  ]
  const lines = [header.join(',')]
  for (const r of results) {
    const tRatio = ratio(r.pr.timeMedianMs, r.baseline.timeMedianMs)
    lines.push([
      r.input.class,
      JSON.stringify(r.input.name),
      r.input.sizeBytes,
      r.runs.baseline,
      r.runs.pr,
      fmtMs(r.baseline.timeMedianMs),
      fmtMs(r.pr.timeMedianMs),
      fmtRatio(tRatio),
      fmtMs(r.baseline.timeP95Ms),
      fmtMs(r.pr.timeP95Ms),
      fmtKb(r.baseline.heapDeltaMedian),
      fmtKb(r.pr.heapDeltaMedian),
      fmtKb(r.baseline.peakRssDeltaMedian),
      fmtKb(r.pr.peakRssDeltaMedian),
      r.status
    ].join(','))
  }
  writeFileSync(path, lines.join('\n') + '\n')
}

export function writeMarkdown(path, summary, meta) {
  const {results, classStats, failures, listGate, pass} = summary
  const lines = []

  lines.push(`# mdast-util-from-markdown PR #${meta.prNumber} bench`)
  lines.push('')
  lines.push(`- baseline: \`${meta.baselineRef}\``)
  lines.push(`- pr: \`${meta.prRef}\``)
  lines.push(`- node: \`${process.version}\` on \`${process.platform}/${process.arch}\``)
  lines.push(`- runs per (impl, input): \`${meta.runs}\``)
  lines.push(`- inputs: \`${meta.inputCount}\``)
  lines.push(`- timestamp: \`${meta.timestamp}\``)
  lines.push('')

  lines.push(pass ? '## Verdict: PASS' : '## Verdict: FAIL')
  lines.push('')

  // Class headlines.
  lines.push('## Per-class headlines (geometric mean of pr/baseline)')
  lines.push('')
  lines.push('| class | inputs | time | heap | peak rss |')
  lines.push('| --- | ---:| ---:| ---:| ---:|')
  for (const cs of classStats) {
    lines.push(`| ${cs.class} | ${cs.count} | ${fmtRatio(cs.timeGeomean)} | ${fmtRatio(cs.heapGeomean)} | ${fmtRatio(cs.peakGeomean)} |`)
  }
  lines.push('')
  lines.push('Values <1.0 mean the PR is faster / uses less. >1.0 means slower / more.')
  lines.push('')

  lines.push('## List-class gate')
  lines.push('')
  lines.push(`- heavy list rows (N >= ${LIST_MIN_N}): **${listGate.rows}**`)
  lines.push(`- target: pr/baseline time geomean **<= ${listGate.target}**`)
  lines.push(`- actual: **${fmtRatio(listGate.actual)}** — ${listGate.pass ? 'PASS' : 'FAIL'}`)
  lines.push('')

  // Top regressions / wins.
  const sorted = results.slice().sort((a, b) => {
    const ra = ratio(a.pr.timeMedianMs, a.baseline.timeMedianMs)
    const rb = ratio(b.pr.timeMedianMs, b.baseline.timeMedianMs)
    return (rb || 0) - (ra || 0)
  })
  const top = sorted.slice(0, 15)
  const bottom = sorted.slice(-15).reverse()

  lines.push('## Top 15 worst time ratios')
  lines.push('')
  lines.push('| input | time base (ms) | time pr (ms) | ratio | heap base (KB) | heap pr (KB) | peak base (KB) | peak pr (KB) |')
  lines.push('| --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:|')
  for (const r of top) {
    const t = ratio(r.pr.timeMedianMs, r.baseline.timeMedianMs)
    lines.push(`| \`${r.input.class}/${r.input.name}\` | ${fmtMs(r.baseline.timeMedianMs)} | ${fmtMs(r.pr.timeMedianMs)} | ${fmtRatio(t)} | ${fmtKb(r.baseline.heapDeltaMedian)} | ${fmtKb(r.pr.heapDeltaMedian)} | ${fmtKb(r.baseline.peakRssDeltaMedian)} | ${fmtKb(r.pr.peakRssDeltaMedian)} |`)
  }
  lines.push('')

  lines.push('## Top 15 best time ratios')
  lines.push('')
  lines.push('| input | time base (ms) | time pr (ms) | ratio | heap base (KB) | heap pr (KB) |')
  lines.push('| --- | ---:| ---:| ---:| ---:| ---:|')
  for (const r of bottom) {
    const t = ratio(r.pr.timeMedianMs, r.baseline.timeMedianMs)
    lines.push(`| \`${r.input.class}/${r.input.name}\` | ${fmtMs(r.baseline.timeMedianMs)} | ${fmtMs(r.pr.timeMedianMs)} | ${fmtRatio(t)} | ${fmtKb(r.baseline.heapDeltaMedian)} | ${fmtKb(r.pr.heapDeltaMedian)} |`)
  }
  lines.push('')

  if (failures.length > 0) {
    lines.push(`## Regressions (${failures.length})`)
    lines.push('')
    lines.push('| input | reasons |')
    lines.push('| --- | --- |')
    for (const f of failures) {
      lines.push(`| \`${f.row.input.class}/${f.row.input.name}\` | ${f.reasons.join('; ')} |`)
    }
    lines.push('')
  } else {
    lines.push('## Regressions')
    lines.push('')
    lines.push('None.')
    lines.push('')
  }

  writeFileSync(path, lines.join('\n'))
}

export function emitReport({results, outDir, meta}) {
  mkdirSync(outDir, {recursive: true})
  const summary = buildSummary(results)
  const stamp = meta.timestamp.replace(/[:.]/g, '-')
  const csvPath = resolve(outDir, `results-${stamp}.csv`)
  const mdPath = resolve(outDir, `summary-${stamp}.md`)
  writeCsv(csvPath, results)
  writeMarkdown(mdPath, summary, {...meta, inputCount: results.length})

  // Refresh latest.* symlinks.
  for (const [name, target] of [['latest.csv', csvPath], ['latest.md', mdPath]]) {
    const linkPath = resolve(outDir, name)
    if (existsSync(linkPath)) {
      try { unlinkSync(linkPath) } catch {}
    }
    try { symlinkSync(target, linkPath) } catch {}
  }

  return {summary, csvPath, mdPath}
}
