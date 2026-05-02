// Real-world-shaped large markdown documents.

import {commonmark} from 'commonmark.json'

function ghDocsLikeReference(itemCount) {
  // Synthetic stand-in for the GitHub Docs GraphQL reference page shape:
  // many sections, each with a long bullet list of fields. Hits the
  // prepareList code path the way that page does (~itemCount list items
  // distributed across sections).
  const sectionCount = Math.max(1, Math.round(itemCount / 80))
  const itemsPerSection = Math.ceil(itemCount / sectionCount)
  const lines = []
  let emitted = 0

  for (let s = 0; s < sectionCount && emitted < itemCount; s++) {
    lines.push(`## Type${s}`)
    lines.push('')
    lines.push(`A short description of \`Type${s}\` and its purpose.`)
    lines.push('')
    lines.push('### Fields')
    lines.push('')
    for (let i = 0; i < itemsPerSection && emitted < itemCount; i++, emitted++) {
      lines.push(`* \`field${emitted}\` (\`String!\`) — short description for field ${emitted}.`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export function* realDocs() {
  // Each CommonMark example as its own input; small but the variety stresses
  // many code paths in aggregate.
  for (let i = 0; i < commonmark.length; i++) {
    const ex = commonmark[i]
    if (!ex.markdown) continue
    yield {
      class: 'real-docs',
      name: `commonmark-spec/${String(i).padStart(4, '0')}-${ex.section.replace(/\s+/g, '-').toLowerCase()}`,
      text: ex.markdown
    }
  }

  // The whole spec concatenated, ~80 KB of varied real markdown.
  const concat = commonmark
    .filter(ex => ex.markdown)
    .map(ex => ex.markdown)
    .join('\n')
  yield {class: 'real-docs', name: 'commonmark-spec/concat', text: concat}

  // GitHub-Docs-shaped reference pages at three scales, including the
  // ~6,400-item shape from issue #49.
  yield {class: 'real-docs', name: 'gh-docs-reference-1k', text: ghDocsLikeReference(1000)}
  yield {class: 'real-docs', name: 'gh-docs-reference-3k', text: ghDocsLikeReference(3000)}
  yield {class: 'real-docs', name: 'gh-docs-reference-6.4k', text: ghDocsLikeReference(6400)}
}
