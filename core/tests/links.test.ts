import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../src/db.js'
import { createRecord } from '../src/records.js'
import { linkRecords, unlinkRecords } from '../src/links.js'

let db: Database.Database
let todoId: string
let projectId: string

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initSchema(db)

  const todo = createRecord(db, { log_type: 'todo', text: 'Implement feature X' })
  const project = createRecord(db, { log_type: 'project', text: 'Project Alpha', title: 'Alpha' })
  todoId = todo.id
  projectId = project.id
})

afterEach(() => {
  db.close()
})

describe('linkRecords', () => {
  it('creates a link and returns {id, source_id, target_id, relation}', () => {
    const result = linkRecords(db, { source_id: todoId, target_id: projectId, relation: 'assigned_to' })

    expect(result.id).toBeTruthy()
    expect(result.source_id).toBe(todoId)
    expect(result.target_id).toBe(projectId)
    expect(result.relation).toBe('assigned_to')
  })

  it('is idempotent — linking the same pair twice returns the existing link', () => {
    const first = linkRecords(db, { source_id: todoId, target_id: projectId, relation: 'assigned_to' })
    const second = linkRecords(db, { source_id: todoId, target_id: projectId, relation: 'assigned_to' })

    expect(second.id).toBe(first.id)
  })

  it('allows different relations between the same pair', () => {
    const link1 = linkRecords(db, { source_id: todoId, target_id: projectId, relation: 'assigned_to' })
    const link2 = linkRecords(db, { source_id: todoId, target_id: projectId, relation: 'related_to' })

    expect(link1.id).not.toBe(link2.id)
  })

  it('throws on self-link', () => {
    expect(() =>
      linkRecords(db, { source_id: todoId, target_id: todoId, relation: 'related_to' }),
    ).toThrow('Cannot link a record to itself')
  })

  it('throws on non-existent source', () => {
    expect(() =>
      linkRecords(db, { source_id: 'non-existent', target_id: projectId, relation: 'test' }),
    ).toThrow('Source record not found')
  })

  it('throws on non-existent target', () => {
    expect(() =>
      linkRecords(db, { source_id: todoId, target_id: 'non-existent', relation: 'test' }),
    ).toThrow('Target record not found')
  })
})

describe('unlinkRecords', () => {
  it('removes a link and returns {changes: 1}', () => {
    linkRecords(db, { source_id: todoId, target_id: projectId, relation: 'assigned_to' })
    const result = unlinkRecords(db, { source_id: todoId, target_id: projectId, relation: 'assigned_to' })

    expect(result.changes).toBe(1)
  })

  it('returns {changes: 0} when link does not exist', () => {
    const result = unlinkRecords(db, { source_id: todoId, target_id: projectId, relation: 'nonexistent' })
    expect(result.changes).toBe(0)
  })
})
