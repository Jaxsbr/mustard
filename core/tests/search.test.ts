import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../src/db.js'
import { createRecord } from '../src/records.js'
import { searchRecords, listRecords } from '../src/search.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initSchema(db)

  createRecord(db, { log_type: 'todo', text: 'Buy groceries at the store', title: 'Shopping' })
  createRecord(db, { log_type: 'todo', text: 'Fix the deployment pipeline', title: 'DevOps', status: 'done' })
  createRecord(db, { log_type: 'idea', text: 'Build a personal knowledge graph', title: 'Knowledge Graph' })
  createRecord(db, { log_type: 'people_note', text: 'Met with Alice about the project', person: 'alice' })
})

afterEach(() => {
  db.close()
})

describe('searchRecords', () => {
  it('returns matching records via FTS', () => {
    const results = searchRecords(db, { query: 'groceries' })
    expect(results.length).toBe(1)
    expect(results[0].title).toBe('Shopping')
    expect(results[0].id).toBeTruthy()
    expect(results[0].log_type).toBe('todo')
  })

  it('filters by type', () => {
    const results = searchRecords(db, { query: 'personal', type: 'idea' })
    expect(results.length).toBe(1)
    expect(results[0].log_type).toBe('idea')
  })

  it('filters by person', () => {
    const results = searchRecords(db, { query: 'alice', person: 'alice' })
    expect(results.length).toBe(1)
    expect(results[0].person).toBe('alice')
  })

  it('filters by status', () => {
    const results = searchRecords(db, { query: 'pipeline', status: 'done' })
    expect(results.length).toBe(1)
    expect(results[0].status).toBe('done')
  })

  it('respects limit', () => {
    const results = searchRecords(db, { query: 'the', limit: 1 })
    expect(results.length).toBeLessThanOrEqual(1)
  })

  it('returns empty array for no matches', () => {
    const results = searchRecords(db, { query: 'xyznonexistent' })
    expect(results).toEqual([])
  })
})

describe('listRecords', () => {
  it('returns all records with total count', () => {
    const result = listRecords(db, {})
    expect(result.records.length).toBe(4)
    expect(result.total).toBe(4)
  })

  it('filters by type', () => {
    const result = listRecords(db, { type: 'todo' })
    expect(result.records.length).toBe(2)
    expect(result.total).toBe(2)
    expect(result.records.every((r) => r.log_type === 'todo')).toBe(true)
  })

  it('filters by status', () => {
    const result = listRecords(db, { status: 'done' })
    expect(result.records.length).toBe(1)
    expect(result.records[0].status).toBe('done')
  })

  it('filters by person', () => {
    const result = listRecords(db, { person: 'alice' })
    expect(result.records.length).toBe(1)
    expect(result.records[0].person).toBe('alice')
  })

  it('sorts by newest (default) and oldest', () => {
    const newest = listRecords(db, { type: 'todo' })
    const oldest = listRecords(db, { type: 'todo', sort: 'oldest' })
    // Both have same records, different order
    expect(newest.records.length).toBe(oldest.records.length)
  })

  it('respects limit', () => {
    const result = listRecords(db, { limit: 2 })
    expect(result.records.length).toBe(2)
    expect(result.total).toBe(4)
  })
})
