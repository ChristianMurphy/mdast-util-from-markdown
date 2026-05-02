// Inputs heavy on code paths that PR #50 should NOT touch.
// Used to confirm the prepareList rewrite doesn't regress unrelated parsing.

function repeat(s, n) {
  return new Array(n).fill(s).join('')
}

function nestedBlockquotes(depth) {
  const lines = []
  for (let d = 1; d <= depth; d++) {
    lines.push(`${repeat('> ', d)}line at depth ${d}`)
  }
  return lines.join('\n')
}

function fencedCodeBlocks(count, sizeBytes) {
  const filler = repeat('a', sizeBytes - 8) // leave room for fence markers
  const lines = []
  for (let i = 0; i < count; i++) {
    lines.push('```')
    lines.push(filler)
    lines.push('```')
    lines.push('')
  }
  return lines.join('\n')
}

function attentionRuns(count) {
  // Long runs of asterisks force the attention algorithm to do work;
  // unrelated to prepareList.
  const lines = []
  for (let i = 0; i < count; i++) {
    lines.push(repeat('*', 200) + ' x ' + repeat('*', 200))
  }
  return lines.join('\n\n')
}

function manyHeadings(count) {
  const lines = []
  for (let i = 0; i < count; i++) {
    const level = (i % 6) + 1
    lines.push(`${repeat('#', level)} heading ${i}`)
    lines.push('paragraph text under the heading')
    lines.push('')
  }
  return lines.join('\n')
}

function manyParagraphs(count) {
  const lines = []
  for (let i = 0; i < count; i++) {
    lines.push(`Paragraph ${i} with some plain prose. No special syntax here.`)
    lines.push('')
  }
  return lines.join('\n')
}

export function* pathological() {
  yield {class: 'pathological', name: 'nested-blockquotes-100', text: nestedBlockquotes(100)}
  yield {class: 'pathological', name: 'nested-blockquotes-500', text: nestedBlockquotes(500)}
  yield {class: 'pathological', name: 'fenced-code-100x5kb', text: fencedCodeBlocks(100, 5000)}
  yield {class: 'pathological', name: 'fenced-code-500x1kb', text: fencedCodeBlocks(500, 1000)}
  yield {class: 'pathological', name: 'attention-runs-100', text: attentionRuns(100)}
  yield {class: 'pathological', name: 'attention-runs-500', text: attentionRuns(500)}
  yield {class: 'pathological', name: 'many-headings-1000', text: manyHeadings(1000)}
  yield {class: 'pathological', name: 'many-headings-5000', text: manyHeadings(5000)}
  yield {class: 'pathological', name: 'many-paragraphs-1000', text: manyParagraphs(1000)}
  yield {class: 'pathological', name: 'many-paragraphs-5000', text: manyParagraphs(5000)}
}
