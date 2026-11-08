// Regression tests for schema-diff.mjs. Run: node --test spacetimedb/qa/schema-diff.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareSchemas } from './schema-diff.mjs'

const col = (name, type) => ({ name: { some: name }, algebraic_type: type })
const str = { String: [] }, u32 = { U32: [] }

// Minimal document in the `spacetime describe --json` shape.
function baseline() {
  const types = [
    { Product: { elements: [col('id', str), col('amount', u32), col('stage', str)] } }, // 0: applications row
    { Product: { elements: [col('id', str), col('role', str)] } }, // 1: users row
    { Product: { elements: [col('application_revision', u32), col('payment_revision', u32)] } }, // 2: RevisionVector
  ]
  return {
    sections: [
      { Typespace: { types } },
      { Types: [{ source_name: { scope: [], source_name: 'Application' }, ty: 0 }, { source_name: { scope: [], source_name: 'RevisionVector' }, ty: 2 }] },
      { Tables: [
        { source_name: 'applications', product_type_ref: 0, primary_key: [0],
          indexes: [{ source_name: { some: 'applications_id_idx' }, algorithm: { BTree: [0] } }, { source_name: { some: 'applications_stage_idx' }, algorithm: { BTree: [2] } }],
          constraints: [{ source_name: { some: 'applications_id_key' }, data: { Unique: { columns: [0] } } }], sequences: [] },
        { source_name: 'users', product_type_ref: 1, primary_key: [0], indexes: [], constraints: [], sequences: [] },
      ] },
      { Reducers: [
        { source_name: 'createApplication', params: { elements: [col('id', str), col('amount', u32)] } },
        { source_name: 'recordReview', params: { elements: [col('application_id', str), col('expected', { Ref: 2 })] } },
      ] },
      { Views: [{ source_name: 'staffApplications', index: 0, params: { elements: [] }, return_type: { Array: { Ref: 0 } } }] },
      { ExplicitNames: { entries: [['a', 'applications'], ['u', 'users']] } },
    ],
  }
}
const clone = value => JSON.parse(JSON.stringify(value))
const section = (doc, key) => doc.sections.find(s => key in s)[key]

// Renumber the typespace (as a different build might) and update every reference.
function renumber(doc, order) {
  const out = clone(doc), types = section(out, 'Typespace').types
  const map = Object.fromEntries(order.map((oldIndex, newIndex) => [oldIndex, newIndex]))
  section(out, 'Typespace').types = order.map(i => types[i])
  const fix = v => Array.isArray(v) ? v.map(fix) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'Ref' && Number.isInteger(x) ? map[x] : fix(x)])) : v
  out.sections = out.sections.map(s => 'Typespace' in s ? s : fix(s))
  for (const t of section(out, 'Tables')) t.product_type_ref = map[t.product_type_ref]
  for (const t of section(out, 'Types')) t.ty = map[t.ty]
  return out
}

test('identical documents compare identical', () => {
  assert.equal(compareSchemas(baseline(), baseline()).identical, true)
})

test('reordered collections and renumbered typespace are still identical', () => {
  const doc = renumber(baseline(), [2, 0, 1])
  section(doc, 'Tables').reverse()
  section(doc, 'Tables').find(t => t.source_name === 'applications').indexes.reverse()
  section(doc, 'Reducers').reverse()
  section(doc, 'Types').reverse()
  section(doc, 'ExplicitNames').entries.reverse()
  const result = compareSchemas(baseline(), doc)
  assert.deepEqual(result.changed, [])
  assert.equal(result.identical, true)
})

test('swapping two table columns is a schema change', () => {
  const doc = baseline()
  const elements = section(doc, 'Typespace').types[0].Product.elements;
  [elements[1], elements[2]] = [elements[2], elements[1]]
  const result = compareSchemas(baseline(), doc)
  assert.equal(result.identical, false)
  assert.ok(result.changed.includes('Tables'))
})

test('reordering reducer parameters is a schema change', () => {
  const doc = baseline()
  section(doc, 'Reducers')[0].params.elements.reverse()
  assert.deepEqual(compareSchemas(baseline(), doc).changed, ['Reducers'])
})

test('changing a nested type reached through a Ref is a schema change', () => {
  const doc = baseline()
  section(doc, 'Typespace').types[2].Product.elements.push(col('collateral_revision', u32))
  const result = compareSchemas(baseline(), doc)
  assert.equal(result.identical, false)
  assert.ok(result.changed.includes('Reducers') && result.changed.includes('Types'))
})

test('moving an index to a different column is a schema change', () => {
  const doc = baseline()
  section(doc, 'Tables')[0].indexes[1].algorithm.BTree = [1]
  assert.deepEqual(compareSchemas(baseline(), doc).changed, ['Tables'])
})

test('removing a reducer is reported by name', () => {
  const doc = baseline()
  section(doc, 'Reducers').pop()
  const result = compareSchemas(baseline(), doc)
  assert.equal(result.identical, false)
  assert.deepEqual(result.summary.find(s => s.key === 'Reducers').removed, ['recordReview'])
})
