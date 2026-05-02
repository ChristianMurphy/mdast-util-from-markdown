// Entry point. Resolves CLI flags, materializes inputs, runs comparison,
// emits report, exits non-zero if regressions or list-gate fail.

import {existsSync} from 'node:fs'
import {execSync} from 'node:child_process'
import {resolve, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {iterateInputs, knownClasses} from './inputs/index.mjs'
import {compareImplementations} from './compare.mjs'
import {emitReport} from './report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

function parseArgs(argv) {
  const opts = {
    runs: 11,
    classes: knownClasses(),
    fuzzLimit: 200,
    config: 'commonmark',
    swap: false,
    out: resolve(HERE, 'out')
  }
  for (const arg of argv) {
    if (arg === '--swap') { opts.swap = true; continue }
    const m = arg.match(/^--([\w-]+)=(.+)$/)
    if (!m) continue
    const [, key, value] = m
    switch (key) {
      case 'runs':       opts.runs = Number(value); break
      case 'inputs':     opts.classes = value.split(',').map(s => s.trim()).filter(Boolean); break
      case 'config':     opts.config = value; break
      case 'fuzz-limit': opts.fuzzLimit = Number(value); break
      case 'out':        opts.out = resolve(value); break
      default: console.warn(`unknown flag --${key}`)
    }
  }
  return opts
}

function refDescribe(repoRoot, ref) {
  try {
    return execSync(`git -C ${repoRoot} rev-parse --short ${ref}`, {encoding: 'utf8'}).trim()
  } catch {
    return ref
  }
}

function ensureWorktrees() {
  const baseline = resolve(REPO_ROOT, 'bench/.baseline')
  const pr = resolve(REPO_ROOT, 'bench/.pr')
  if (!existsSync(baseline) || !existsSync(pr)) {
    console.error('worktrees missing. run: bash bench/setup.sh')
    process.exit(2)
  }
  return {baseline, pr}
}

function implPath(worktree) {
  return resolve(worktree, 'dev/lib/index.js')
}

async function main() {
  if (typeof global.gc !== 'function') {
    console.error('node must be started with --expose-gc')
    process.exit(2)
  }

  const opts = parseArgs(process.argv.slice(2))
  const {baseline, pr} = ensureWorktrees()

  const inputs = Array.from(iterateInputs({
    repoRoot: REPO_ROOT,
    classes: opts.classes,
    configName: opts.config,
    fuzzLimit: opts.fuzzLimit
  }))

  if (inputs.length === 0) {
    console.error('no inputs. check --inputs=... or BENCH_FUZZ_CORPUS')
    process.exit(2)
  }

  const baselineRef = refDescribe(REPO_ROOT, 'HEAD')
  const prRef = refDescribe(REPO_ROOT, 'pr-50')

  console.error('bench:')
  console.error(`  baseline    : ${baseline} @ ${baselineRef}`)
  console.error(`  pr          : ${pr} @ ${prRef}`)
  console.error(`  inputs      : ${inputs.length} (${opts.classes.join(', ')})`)
  console.error(`  runs/input  : ${opts.runs}`)
  console.error(`  swap impls  : ${opts.swap}`)
  console.error('')

  const t0 = Date.now()
  const results = await compareImplementations({
    inputs,
    baselinePath: opts.swap ? implPath(pr) : implPath(baseline),
    prPath: opts.swap ? implPath(baseline) : implPath(pr),
    runs: opts.runs,
    swap: false,
    log: msg => console.error(msg)
  })
  const elapsedMs = Date.now() - t0

  const meta = {
    prNumber: 50,
    baselineRef: opts.swap ? `pr-50 (${prRef}) [swapped]` : `main (${baselineRef})`,
    prRef: opts.swap ? `main (${baselineRef}) [swapped]` : `pr-50 (${prRef})`,
    runs: opts.runs,
    timestamp: new Date().toISOString()
  }

  const {summary, csvPath, mdPath} = emitReport({results, outDir: opts.out, meta})

  console.error('')
  console.error(`bench complete in ${(elapsedMs / 1000).toFixed(1)}s`)
  console.error(`csv     : ${csvPath}`)
  console.error(`summary : ${mdPath}`)
  console.error(`verdict : ${summary.pass ? 'PASS' : 'FAIL'} (${summary.failures.length} regressions, list-gate ${summary.listGate.pass ? 'PASS' : 'FAIL'})`)

  process.exit(summary.pass ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
