// Loads inputs from the remark-fuzz corpus when available.
// Path defaults to ../../remark-fuzz/corpus relative to the repo root,
// overridable via BENCH_FUZZ_CORPUS=<absolute-path>.

import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join, resolve} from 'node:path'

const DEFAULT_REL = '../remark-fuzz/corpus'
const MAX_BYTES = 64 * 1024 // skip giant inputs to keep wall-clock bounded

function corpusRoot(repoRoot) {
  if (process.env.BENCH_FUZZ_CORPUS) return resolve(process.env.BENCH_FUZZ_CORPUS)
  return resolve(repoRoot, DEFAULT_REL)
}

function exists(path) {
  try { statSync(path); return true } catch { return false }
}

export function* fuzzCorpus({repoRoot, configName = 'commonmark', limit}) {
  const root = corpusRoot(repoRoot)
  const dir = join(root, configName)
  if (!exists(dir)) return

  const files = readdirSync(dir).sort()
  let yielded = 0

  for (const file of files) {
    if (limit !== undefined && yielded >= limit) return
    const path = join(dir, file)
    let stat
    try { stat = statSync(path) } catch { continue }
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES) continue

    let text
    try { text = readFileSync(path, 'utf8') } catch { continue }

    yield {class: 'fuzz', name: `${configName}/${file}`, text}
    yielded++
  }
}
