// Synthetic list inputs targeting the prepareList code path.
// These are where PR #50 should win and where the curve shape (n vs n^2)
// is most visible.

const FLAT_SIZES = [100, 500, 1000, 2500, 5000, 10000]
const NESTED_SIZES = [100, 500, 1000, 2500]
const PARA_SIZES = [100, 500, 1000, 2500]

function flatUnordered(n) {
  const lines = new Array(n)
  for (let i = 0; i < n; i++) lines[i] = `* item ${i}`
  return lines.join('\n')
}

function flatOrdered(n) {
  const lines = new Array(n)
  for (let i = 0; i < n; i++) lines[i] = `${i + 1}. item ${i}`
  return lines.join('\n')
}

function nestedUnordered(n) {
  // n outer items, each with two nested children. Tests prepareList recursion.
  const lines = []
  for (let i = 0; i < n; i++) {
    lines.push(`* item ${i}`)
    lines.push(`  * child ${i}.a`)
    lines.push(`  * child ${i}.b`)
  }
  return lines.join('\n')
}

function paragraphPerItem(n) {
  // List items each containing a wrapped paragraph. Many lineEnding events
  // exercise the backward tail scan that the PR also tightens.
  const lines = []
  for (let i = 0; i < n; i++) {
    lines.push(`* item ${i} has a longer paragraph that wraps a bit`)
    lines.push(`  and continues onto a second line for emphasis`)
    lines.push('')
  }
  return lines.join('\n')
}

export function* syntheticLists() {
  for (const n of FLAT_SIZES) {
    yield {class: 'lists', name: `flat-unordered-${n}`, text: flatUnordered(n)}
    yield {class: 'lists', name: `flat-ordered-${n}`, text: flatOrdered(n)}
  }
  for (const n of NESTED_SIZES) {
    yield {class: 'lists', name: `nested-unordered-${n}`, text: nestedUnordered(n)}
  }
  for (const n of PARA_SIZES) {
    yield {class: 'lists', name: `paragraph-per-item-${n}`, text: paragraphPerItem(n)}
  }
}
