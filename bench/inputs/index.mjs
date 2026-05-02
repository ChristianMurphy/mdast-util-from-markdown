// Public iterator over all input classes.
// Yields {class, name, text} records.

import {syntheticLists} from './synthetic-lists.mjs'
import {pathological} from './pathological.mjs'
import {fuzzCorpus} from './fuzz-corpus.mjs'
import {realDocs} from './real-docs.mjs'

const ALL_CLASSES = new Set(['lists', 'pathological', 'fuzz', 'real-docs'])

export function* iterateInputs({repoRoot, classes, configName, fuzzLimit}) {
  const enabled = classes && classes.length > 0
    ? new Set(classes)
    : ALL_CLASSES

  if (enabled.has('lists')) yield* syntheticLists()
  if (enabled.has('pathological')) yield* pathological()
  if (enabled.has('real-docs')) yield* realDocs()
  if (enabled.has('fuzz')) yield* fuzzCorpus({repoRoot, configName, limit: fuzzLimit})
}

export function knownClasses() {
  return Array.from(ALL_CLASSES)
}
