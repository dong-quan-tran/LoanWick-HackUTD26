// Compare two `spacetime describe --json` outputs, ignoring ordering.
// Usage: node spacetimedb/qa/schema-diff.mjs <deployed.json> <candidate.json>
// Exit 0 = identical schema (a republish keeps data and clients), 1 = schema differs, 2 = bad input.
import { readFileSync } from 'node:fs'

const load = path => {
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(parsed.sections)) throw new Error(`${path} is not a describe --json document`)
  return Object.fromEntries(parsed.sections.map(section => Object.entries(section)[0]))
}
const normalize = value => Array.isArray(value)
  ? value.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)])) : value
const names = (items = []) => new Set(items.map(item => item.source_name ?? item.name))

try {
  const [deployedPath, candidatePath] = process.argv.slice(2)
  if (!deployedPath || !candidatePath) throw new Error('usage: schema-diff.mjs <deployed.json> <candidate.json>')
  const deployed = load(deployedPath), candidate = load(candidatePath)
  const sections = [...new Set([...Object.keys(deployed), ...Object.keys(candidate)])]
  const changed = sections.filter(key => JSON.stringify(normalize(deployed[key])) !== JSON.stringify(normalize(candidate[key])))
  for (const key of ['Tables', 'Reducers', 'Views']) {
    const before = names(deployed[key]), after = names(candidate[key])
    const added = [...after].filter(n => !before.has(n)), removed = [...before].filter(n => !after.has(n))
    console.log(`${key}: ${after.size} (${added.length ? `added ${added.join(', ')}` : 'none added'}; ${removed.length ? `removed ${removed.join(', ')}` : 'none removed'})`)
  }
  if (!changed.length) {
    console.log('RESULT: schema identical to the deployed database. An approved republish keeps data and existing clients.')
    process.exit(0)
  }
  console.log(`RESULT: schema differs in ${changed.join(', ')}. Publishing needs owner review (automatic migration or a new database name).`)
  process.exit(1)
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error))
  process.exit(2)
}
