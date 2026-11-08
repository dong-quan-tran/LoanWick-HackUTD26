// Compare two `spacetime describe --json` outputs.
// Usage: node spacetimedb/qa/schema-diff.mjs <deployed.json> <candidate.json>
// Exit 0 = identical schema (a republish keeps data and clients), 1 = schema differs, 2 = bad input.
//
// Ordering rules:
// - Collections that are sets keyed by name (tables, reducers, views, types, schedules, explicit names, and each
//   table's indexes / constraints / sequences) are sorted by name, because builds may emit them in any order.
// - Everything positional is compared IN ORDER: table columns, primary-key and index column positions, reducer and
//   view parameters. Reordering columns or parameters is a breaking change and must be reported.
// - Every typespace reference is resolved recursively (columns, nested objects, reducer/view parameters, named types),
//   so build-to-build type numbering does not matter but any change to a type's fields or their order does.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const nameOf = item => JSON.stringify(item?.source_name ?? item?.name ?? item)
const byName = items => [...(items ?? [])].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))

export function sectionsOf(document) {
  if (!Array.isArray(document?.sections)) throw new Error('not a `spacetime describe --json` document')
  return Object.fromEntries(document.sections.map(section => Object.entries(section)[0]))
}

// Replace every {"Ref": n} with the referenced type, recursively, so nested types are compared by content.
function resolver(typespace) {
  const resolve = (value, stack = []) => {
    if (Array.isArray(value)) return value.map(item => resolve(item, stack))
    if (value && typeof value === 'object') {
      const keys = Object.keys(value)
      if (keys.length === 1 && keys[0] === 'Ref' && Number.isInteger(value.Ref)) {
        if (stack.includes(value.Ref)) return { recursiveRef: stack.length - stack.indexOf(value.Ref) }
        return typespace[value.Ref] === undefined ? { unresolvedRef: value.Ref } : resolve(typespace[value.Ref], [...stack, value.Ref])
      }
      return Object.fromEntries(keys.map(key => [key, resolve(value[key], stack)]))
    }
    return value
  }
  return { resolve, ref: n => resolve({ Ref: n }) }
}

export function canonicalize(sections) {
  const { resolve, ref } = resolver(sections.Typespace?.types ?? [])
  const out = {}
  for (const [key, value] of Object.entries(sections)) {
    if (key === 'Typespace') continue // its numbering is build-dependent; every use is resolved inline below
    if (key === 'Tables') {
      out.Tables = byName(value.map(({ product_type_ref, ...table }) => ({
        ...resolve(table),
        columns: ref(product_type_ref), // column ORDER is preserved
        indexes: byName(table.indexes), constraints: byName(table.constraints), sequences: byName(table.sequences),
      })))
    } else if (key === 'Types' && Array.isArray(value)) {
      out.Types = byName(value.map(({ ty, ...entry }) => ({ ...entry, ty: Number.isInteger(ty) ? ref(ty) : resolve(ty) })))
    } else if (key === 'ExplicitNames') {
      out.ExplicitNames = { ...value, entries: [...(value?.entries ?? [])].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) }
    } else if (['Reducers', 'Views', 'Schedules', 'LifeCycleReducers', 'ViewPrimaryKeys'].includes(key) && Array.isArray(value)) {
      out[key] = byName(resolve(value)) // parameter order inside each entry is preserved
    } else {
      out[key] = resolve(value)
    }
  }
  return out
}

export function compareSchemas(deployedDocument, candidateDocument) {
  const deployed = sectionsOf(deployedDocument), candidate = sectionsOf(candidateDocument)
  const a = canonicalize(deployed), b = canonicalize(candidate)
  const sections = [...new Set([...Object.keys(a), ...Object.keys(b)])]
  const changed = sections.filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
  const names = items => new Set((items ?? []).map(item => item.source_name ?? item.name))
  const summary = ['Tables', 'Reducers', 'Views'].map(key => {
    const before = names(deployed[key]), after = names(candidate[key])
    return { key, count: after.size, added: [...after].filter(n => !before.has(n)), removed: [...before].filter(n => !after.has(n)) }
  })
  return { identical: changed.length === 0, changed, summary }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const [deployedPath, candidatePath] = process.argv.slice(2)
    if (!deployedPath || !candidatePath) throw new Error('usage: schema-diff.mjs <deployed.json> <candidate.json>')
    const result = compareSchemas(JSON.parse(readFileSync(deployedPath, 'utf8')), JSON.parse(readFileSync(candidatePath, 'utf8')))
    for (const { key, count, added, removed } of result.summary) {
      console.log(`${key}: ${count} (${added.length ? `added ${added.join(', ')}` : 'none added'}; ${removed.length ? `removed ${removed.join(', ')}` : 'none removed'})`)
    }
    if (result.identical) {
      console.log('RESULT: schema identical to the deployed database. An approved republish keeps data and existing clients.')
      process.exit(0)
    }
    console.log(`RESULT: schema differs in ${result.changed.join(', ')}. Publishing needs owner review (automatic migration or a new database name).`)
    process.exit(1)
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error))
    process.exit(2)
  }
}
