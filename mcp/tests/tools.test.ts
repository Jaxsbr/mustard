import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { initSchema, rebuildFts } from '../src/db.js'
import { searchRecords, listRecords } from '../src/tools/search.js'
import { getRecord, createRecord, updateRecord, deleteRecord } from '../src/tools/crud.js'
import { linkRecords, unlinkRecords } from '../src/tools/links.js'
import { getContext, projectSummary } from '../src/tools/context.js'
import { dailySummary } from '../src/tools/summary.js'

const TEST_DB_PATH = path.join(os.tmpdir(), `mustard-test-${Date.now()}.db`)
let db: Database.Database

function seedTestData(database: Database.Database): void {
  const insert = database.prepare(`
    INSERT INTO records (
      id, log_type, title, text, capture_date,
      person, status, due_date, category, theme, period,
      source_origin, tags, source_url, delegate, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const now = '2026-03-25 10:00:00'
  const today = '2026-03-25'

  const txn = database.transaction(() => {
    insert.run('id-todo-1', 'todo', 'Buy groceries', 'Need milk, eggs, bread', today, null, 'open', today, 'personal', null, null, 'mustard-app', '[]', null, null, now, now)
    insert.run('id-todo-2', 'todo', 'Fix CI pipeline', 'The deploy step is flaky', today, null, 'open', '2026-03-24', 'work', null, null, 'mustard-app', '["devops","ci"]', null, null, now, now)
    insert.run('id-todo-3', 'todo', 'Review PR', 'Review Sway PR #42', today, null, 'done', today, 'work', null, null, 'mustard-app', '[]', null, null, now, now)
    insert.run('id-note-1', 'people_note', null, 'Tatai called about AI upskilling initiative. Very productive call.', '2026-03-20', 'tatai', 'logged', null, null, null, null, 'manual-extract', '["coaching","ai"]', null, null, now, now)
    insert.run('id-note-2', 'people_note', null, 'Sway mentioned interest in compound engineering patterns.', '2026-03-22', 'sway', 'logged', null, null, null, null, 'cursor-skill', '["engineering"]', null, null, now, now)
    insert.run('id-log-1', 'daily_log', null, 'Big day. Shipped the MCP migration and it works great.', today, null, 'logged', null, null, 'shipping', 'day', 'mustard-app', '["milestone"]', null, null, now, now)
    insert.run('id-idea-1', 'idea', 'MCP Dashboard', 'A minimal read-only dashboard that queries SQLite directly.', today, null, 'open', null, null, null, null, 'mustard-app', '["tooling"]', null, null, now, now)
  })
  txn()

  rebuildFts(database)
}

beforeAll(() => {
  db = new Database(TEST_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initSchema(db)
  seedTestData(db)
})

afterAll(() => {
  db.close()
  try { fs.unlinkSync(TEST_DB_PATH) } catch { /* ignore */ }
  try { fs.unlinkSync(TEST_DB_PATH + '-wal') } catch { /* ignore */ }
  try { fs.unlinkSync(TEST_DB_PATH + '-shm') } catch { /* ignore */ }
})

describe('search_records', () => {
  it('finds records by text content', () => {
    const result = searchRecords(db, { query: 'tatai' })
    expect(result).toContain('tatai')
    expect(result).toContain('AI upskilling')
  })

  it('filters by type', () => {
    const result = searchRecords(db, { query: 'tatai', type: 'people_note' })
    expect(result).toContain('people_note')
    expect(result).not.toContain('todo')
  })

  it('filters by person', () => {
    const result = searchRecords(db, { query: 'engineering', person: 'sway' })
    expect(result).toContain('sway')
    expect(result).toContain('compound engineering')
  })

  it('returns empty message when nothing matches', () => {
    const result = searchRecords(db, { query: 'xyznonexistent' })
    expect(result).toContain('No records found')
  })
})

describe('list_records', () => {
  it('lists all records without filters', () => {
    const result = listRecords(db, {})
    expect(result).toContain('7 total')
  })

  it('filters by type', () => {
    const result = listRecords(db, { type: 'todo' })
    expect(result).toContain('todo')
  })

  it('filters by status', () => {
    const result = listRecords(db, { type: 'todo', status: 'open' })
    expect(result).toContain('Buy groceries')
    expect(result).not.toContain('Review PR')
  })

  it('filters by person', () => {
    const result = listRecords(db, { person: 'tatai' })
    expect(result).toContain('tatai')
    expect(result).not.toContain('sway')
  })

  it('respects limit', () => {
    const result = listRecords(db, { limit: 2 })
    expect(result).toContain('Showing 2 of 7')
  })
})

describe('get_record', () => {
  it('returns a record by id', () => {
    const result = getRecord(db, 'id-todo-1')
    expect(result).toContain('Buy groceries')
    expect(result).toContain('milk, eggs, bread')
  })

  it('returns not found for missing id', () => {
    const result = getRecord(db, '00000000-0000-0000-0000-000000000000')
    expect(result).toContain('not found')
  })
})

describe('create_record', () => {
  it('creates a new todo', () => {
    const result = createRecord(db, {
      log_type: 'todo',
      text: 'Test todo from vitest',
      title: 'Vitest Todo',
      status: 'open',
    })
    expect(result).toContain('created successfully')
    expect(result).toContain('Vitest Todo')
  })

  it('rejects invalid log_type', () => {
    const result = createRecord(db, { log_type: 'invalid', text: 'test' })
    expect(result).toContain('Invalid log_type')
  })

  it('rejects empty text', () => {
    const result = createRecord(db, { log_type: 'todo', text: '' })
    expect(result).toContain('required')
  })
})

describe('update_record', () => {
  it('updates text and status', () => {
    const result = updateRecord(db, {
      id: 'id-todo-1',
      text: 'Updated groceries list',
      status: 'done',
    })
    expect(result).toContain('updated successfully')
    expect(result).toContain('Updated groceries list')
    expect(result).toContain('done')
  })

  it('returns not found for missing id', () => {
    const result = updateRecord(db, {
      id: '00000000-0000-0000-0000-000000000000',
      text: 'nope',
    })
    expect(result).toContain('not found')
  })

  it('returns message when no fields provided', () => {
    const result = updateRecord(db, { id: 'id-todo-1' })
    expect(result).toContain('No fields')
  })
})

describe('delete_record', () => {
  it('deletes a record', () => {
    const result = deleteRecord(db, 'id-todo-3')
    expect(result).toContain('Deleted')
    expect(result).toContain('Review PR')

    const check = getRecord(db, 'id-todo-3')
    expect(check).toContain('not found')
  })

  it('returns not found for missing id', () => {
    const result = deleteRecord(db, '00000000-0000-0000-0000-000000000000')
    expect(result).toContain('not found')
  })
})

describe('project records', () => {
  let projectId: string

  it('creates a project record', () => {
    const result = createRecord(db, {
      log_type: 'project',
      text: 'Mustard knowledge graph implementation',
      title: 'Mustard Graph',
      status: 'open',
      tags: ['mustard', 'knowledge-graph'],
    })
    expect(result).toContain('created successfully')
    expect(result).toContain('Mustard Graph')
    expect(result).toContain('project')

    const idMatch = result.match(/ID: ([a-f0-9-]+)/)
    expect(idMatch).toBeTruthy()
    projectId = idMatch![1]
  })

  it('rejects project with empty text', () => {
    const result = createRecord(db, {
      log_type: 'project',
      text: '',
      title: 'Empty Project',
    })
    expect(result).toContain('required')
  })

  it('retrieves project by id', () => {
    const result = getRecord(db, projectId)
    expect(result).toContain('Mustard Graph')
    expect(result).toContain('project')
    expect(result).toContain('mustard, knowledge-graph')
  })

  it('FTS indexes project records — search by unique text content', () => {
    // "knowledge graph" is unique to the project record
    const result = searchRecords(db, { query: 'knowledge graph' })
    expect(result).toContain('Mustard Graph')
    expect(result).toContain('project')
  })

  it('search_records type=project isolates by type — shared keyword returns only matching type', () => {
    // Create a todo that shares a keyword with the project record
    createRecord(db, {
      log_type: 'todo',
      text: 'Review the knowledge graph timeline',
      title: 'Graph Review',
      status: 'open',
    })

    // "knowledge graph" appears in both the project and the new todo
    const projectOnly = searchRecords(db, { query: 'knowledge graph', type: 'project' })
    expect(projectOnly).toContain('Mustard Graph')
    expect(projectOnly).not.toContain('Graph Review')

    const todoOnly = searchRecords(db, { query: 'knowledge graph', type: 'todo' })
    expect(todoOnly).toContain('Graph Review')
    expect(todoOnly).not.toContain('Mustard Graph')
  })

  it('list_records type=project returns only projects', () => {
    const result = listRecords(db, { type: 'project' })
    expect(result).toContain('Mustard Graph')
    expect(result).not.toContain('todo')
    expect(result).not.toContain('people_note')
  })

  it('list_records total count includes projects', () => {
    const all = listRecords(db, {})
    // Original seed: 7 records + 1 vitest todo + 1 project + 1 "Graph Review" todo = 10
    // Minus 1 deleted (id-todo-3) = 9
    expect(all).toContain('9 total')
  })

  it('existing record types are unaffected', () => {
    // Verify each non-project type still works
    const todoResult = getRecord(db, 'id-todo-2')
    expect(todoResult).toContain('Fix CI pipeline')

    const noteResult = getRecord(db, 'id-note-1')
    expect(noteResult).toContain('people_note')

    const ideaResult = getRecord(db, 'id-idea-1')
    expect(ideaResult).toContain('MCP Dashboard')

    const logResult = getRecord(db, 'id-log-1')
    expect(logResult).toContain('daily_log')
  })
})

describe('link_records', () => {
  it('creates a link and returns confirmation with labels', () => {
    const result = linkRecords(db, {
      source_id: 'id-note-1',
      target_id: 'id-todo-2',
      relation: 'assigned_to',
    })
    expect(result).toContain('Linked')
    expect(result).toContain('assigned_to')
    expect(result).toContain('Link ID')
  })

  it('is idempotent — duplicate does not create second row', () => {
    const countBefore = (db.prepare('SELECT COUNT(*) as cnt FROM links WHERE source_id = ? AND target_id = ? AND relation = ?')
      .get('id-note-1', 'id-todo-2', 'assigned_to') as { cnt: number }).cnt

    const result = linkRecords(db, {
      source_id: 'id-note-1',
      target_id: 'id-todo-2',
      relation: 'assigned_to',
    })
    expect(result).toContain('already exists')

    const countAfter = (db.prepare('SELECT COUNT(*) as cnt FROM links WHERE source_id = ? AND target_id = ? AND relation = ?')
      .get('id-note-1', 'id-todo-2', 'assigned_to') as { cnt: number }).cnt
    expect(countAfter).toBe(countBefore)
  })

  it('rejects self-link', () => {
    const result = linkRecords(db, {
      source_id: 'id-note-1',
      target_id: 'id-note-1',
      relation: 'related_to',
    })
    expect(result).toContain('Cannot link a record to itself')
  })

  it('rejects non-existent source', () => {
    const result = linkRecords(db, {
      source_id: '00000000-0000-0000-0000-000000000000',
      target_id: 'id-todo-2',
      relation: 'related_to',
    })
    expect(result).toContain('Source record not found')
  })

  it('rejects non-existent target', () => {
    const result = linkRecords(db, {
      source_id: 'id-todo-2',
      target_id: '00000000-0000-0000-0000-000000000000',
      relation: 'related_to',
    })
    expect(result).toContain('Target record not found')
  })

  it('allows different relations between same pair', () => {
    const result = linkRecords(db, {
      source_id: 'id-note-1',
      target_id: 'id-todo-2',
      relation: 'related_to',
    })
    expect(result).toContain('Linked')
  })
})

describe('unlink_records', () => {
  it('removes an existing link', () => {
    const result = unlinkRecords(db, {
      source_id: 'id-note-1',
      target_id: 'id-todo-2',
      relation: 'related_to',
    })
    expect(result).toContain('Unlinked')

    // Verify it's gone
    const row = db.prepare('SELECT id FROM links WHERE source_id = ? AND target_id = ? AND relation = ?')
      .get('id-note-1', 'id-todo-2', 'related_to')
    expect(row).toBeUndefined()
  })

  it('returns not found for non-existent link', () => {
    const result = unlinkRecords(db, {
      source_id: 'id-note-1',
      target_id: 'id-todo-2',
      relation: 'nonexistent_relation',
    })
    expect(result).toContain('Link not found')
  })
})

describe('cascade delete links', () => {
  it('deleting a record removes links where it is SOURCE', () => {
    const created = createRecord(db, {
      log_type: 'todo',
      text: 'Cascade source test',
      title: 'Cascade Src',
      status: 'open',
    })
    const id = created.match(/ID: ([a-f0-9-]+)/)![1]

    linkRecords(db, { source_id: id, target_id: 'id-note-1', relation: 'related_to' })
    expect((db.prepare('SELECT COUNT(*) as cnt FROM links WHERE source_id = ?').get(id) as { cnt: number }).cnt).toBe(1)

    deleteRecord(db, id)
    expect((db.prepare('SELECT COUNT(*) as cnt FROM links WHERE source_id = ?').get(id) as { cnt: number }).cnt).toBe(0)
  })

  it('deleting a record removes links where it is TARGET', () => {
    const created = createRecord(db, {
      log_type: 'todo',
      text: 'Cascade target test',
      title: 'Cascade Tgt',
      status: 'open',
    })
    const id = created.match(/ID: ([a-f0-9-]+)/)![1]

    linkRecords(db, { source_id: 'id-note-1', target_id: id, relation: 'related_to' })
    expect((db.prepare('SELECT COUNT(*) as cnt FROM links WHERE target_id = ?').get(id) as { cnt: number }).cnt).toBe(1)

    deleteRecord(db, id)
    expect((db.prepare('SELECT COUNT(*) as cnt FROM links WHERE target_id = ?').get(id) as { cnt: number }).cnt).toBe(0)
  })
})

describe('links table schema', () => {
  it('has correct DDL with FKs, UNIQUE, and indexes', () => {
    const tableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='links'").get() as { sql: string }).sql
    expect(tableSql).toContain('source_id')
    expect(tableSql).toContain('target_id')
    expect(tableSql).toContain('relation')
    expect(tableSql).toContain('ON DELETE CASCADE')
    expect(tableSql).toContain('UNIQUE')

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='links' AND name LIKE 'idx_%'").all() as { name: string }[]
    const indexNames = indexes.map(i => i.name)
    expect(indexNames).toContain('idx_links_source')
    expect(indexNames).toContain('idx_links_target')
  })
})

describe('get_context', () => {
  beforeAll(() => {
    // Set up a project with links for context testing
    db.prepare(`
      INSERT INTO records (id, log_type, title, text, capture_date, source_origin, tags, created_at, updated_at)
      VALUES ('id-proj-ctx', 'project', 'Context Test Project', 'Project for context tests', '2026-03-25', 'mustard-mcp', '[]', '2026-03-25 10:00:00', '2026-03-25 10:00:00')
    `).run()

    // Link note-1 → project (outgoing from note-1, incoming to project)
    linkRecords(db, { source_id: 'id-note-1', target_id: 'id-proj-ctx', relation: 'member_of' })
    // Link project → idea (outgoing from project)
    linkRecords(db, { source_id: 'id-proj-ctx', target_id: 'id-idea-1', relation: 'related_to' })
    // Link note-1 → project with DIFFERENT relation
    linkRecords(db, { source_id: 'id-note-1', target_id: 'id-proj-ctx', relation: 'related_to' })
  })

  it('record_id returns anchor + 1-hop linked in BOTH directions', () => {
    const result = getContext(db, { record_id: 'id-proj-ctx' })
    expect(result).toContain('Context Test Project')
    // note-1 linked as incoming (source_id=note-1, target_id=project)
    expect(result).toContain('tatai')
    // idea-1 linked as outgoing (source_id=project, target_id=idea-1)
    expect(result).toContain('MCP Dashboard')
  })

  it('person slug returns person records + linked', () => {
    const result = getContext(db, { person: 'tatai' })
    expect(result).toContain('Anchor Records')
    expect(result).toContain('tatai')
    // note-1 is linked to project, so project should show in linked
    expect(result).toContain('Context Test Project')
  })

  it('project title partial match returns project + linked', () => {
    const result = getContext(db, { project: 'Context Test' })
    expect(result).toContain('Context Test Project')
    expect(result).toContain('Linked Records')
  })

  it('same record linked via multiple relations appears once per relation', () => {
    // note-1 is linked to project via both 'member_of' and 'related_to'
    // When viewing from project, note-1 should appear under both relations
    const result = getContext(db, { record_id: 'id-proj-ctx' })
    expect(result).toContain('### member_of')
    expect(result).toContain('### related_to')
    // tatai should appear in both sections
    const memberSection = result.split('### member_of')[1]?.split('###')[0] ?? ''
    expect(memberSection).toContain('tatai')
  })

  it('anchor records NOT repeated in linked section', () => {
    // When person=tatai is the anchor and it's linked to project,
    // project shows in linked, but tatai's note should NOT appear in linked
    const result = getContext(db, { person: 'tatai' })
    const linkedSection = result.split('## Linked Records')[1] ?? ''
    // tatai's note id is id-note-1 — it should NOT appear in linked section
    expect(linkedSection).not.toContain('ID: id-note-1')
    // But the linked project SHOULD appear
    expect(linkedSection).toContain('Context Test Project')
  })

  it('results grouped by relationship type with section headers', () => {
    const result = getContext(db, { record_id: 'id-proj-ctx' })
    expect(result).toContain('### member_of')
    expect(result).toContain('### related_to')
    // Count headers — should have at least 2 relation sections
    const headers = (result.match(/### [a-z_]+/g) ?? [])
    expect(headers.length).toBeGreaterThanOrEqual(2)
  })

  it('no params returns empty result (not crash)', () => {
    const result = getContext(db, {})
    expect(result).toContain('No matching records found')
  })

  it('non-existent record_id returns empty result', () => {
    const result = getContext(db, { record_id: '00000000-0000-0000-0000-000000000000' })
    expect(result).toContain('No matching records found')
  })

  it('non-existent person returns empty result', () => {
    const result = getContext(db, { person: 'nobody' })
    expect(result).toContain('No matching records found')
  })

  it('all three params combined deduplicates correctly', () => {
    // note-1 is by tatai and linked to the project — should not appear twice as anchor
    const result = getContext(db, {
      record_id: 'id-note-1',
      person: 'tatai',
      project: 'Context Test',
    })
    // Count how many times id-note-1 appears as anchor
    const anchorSection = result.split('## Linked Records')[0]
    const noteCount = (anchorSection.match(/ID: id-note-1/g) ?? []).length
    expect(noteCount).toBe(1)
    // Project should also be an anchor (not duplicated)
    const projCount = (anchorSection.match(/ID: id-proj-ctx/g) ?? []).length
    expect(projCount).toBe(1)
  })

  it('record with no links shows (none) in linked section', () => {
    const result = getContext(db, { record_id: 'id-log-1' })
    expect(result).toContain('Anchor Records')
    expect(result).toContain('(none)')
  })
})

describe('get_context enhanced params', () => {
  beforeAll(() => {
    // Create records with varied dates for since/depth testing
    const insert = db.prepare(`
      INSERT INTO records (id, log_type, title, text, capture_date, source_origin, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'mustard-mcp', '[]', ?, ?)
    `)

    insert.run('id-old-proj', 'project', 'Old Project', 'Created in January', '2026-01-15', '2026-01-15 10:00:00', '2026-01-15 10:00:00')
    insert.run('id-old-idea', 'idea', 'Old Idea', 'January idea', '2026-01-20', '2026-01-20 10:00:00', '2026-01-20 10:00:00')
    insert.run('id-new-idea', 'idea', 'New Idea', 'March idea', '2026-03-25', '2026-03-25 10:00:00', '2026-03-25 10:00:00')
    insert.run('id-depth2', 'people_note', 'Depth 2 Note', 'Two hops away', '2026-03-25', '2026-03-25 10:00:00', '2026-03-25 10:00:00')
    insert.run('id-depth3', 'todo', 'Depth 3 Todo', 'Three hops away', '2026-03-25', '2026-03-25 10:00:00', '2026-03-25 10:00:00')

    // Chain: old-proj → old-idea (depth 1), old-proj → new-idea (depth 1)
    linkRecords(db, { source_id: 'id-old-proj', target_id: 'id-old-idea', relation: 'related_to' })
    linkRecords(db, { source_id: 'id-old-proj', target_id: 'id-new-idea', relation: 'related_to' })
    // Chain: new-idea → depth2 (depth 2 from old-proj)
    linkRecords(db, { source_id: 'id-new-idea', target_id: 'id-depth2', relation: 'inspired_by' })
    // Chain: depth2 → depth3 (depth 3 from old-proj — should NOT appear at depth 2)
    linkRecords(db, { source_id: 'id-depth2', target_id: 'id-depth3', relation: 'blocked_by' })
  })

  it('since filters linked records by date', () => {
    const result = getContext(db, { record_id: 'id-old-proj', since: '2026-03-01' })
    expect(result).toContain('New Idea')
    expect(result).not.toContain('Old Idea')
  })

  it('since does NOT filter anchors — old anchor still appears', () => {
    const result = getContext(db, { record_id: 'id-old-proj', since: '2026-03-01' })
    // The anchor is from January, but since only filters linked records
    expect(result).toContain('Old Project')
    expect(result).toContain('Anchor Records')
  })

  it('depth 2 follows links-of-links', () => {
    const result = getContext(db, { record_id: 'id-old-proj', depth: 2 })
    expect(result).toContain('New Idea')    // depth 1
    expect(result).toContain('Depth 2 Note') // depth 2
  })

  it('depth 2 does NOT return depth-3 records', () => {
    const result = getContext(db, { record_id: 'id-old-proj', depth: 2 })
    expect(result).not.toContain('Depth 3 Todo')
  })

  it('depth 1 (default) does NOT return depth-2 records', () => {
    const result = getContext(db, { record_id: 'id-old-proj' })
    expect(result).not.toContain('Depth 2 Note')
    expect(result).not.toContain('Depth 3 Todo')
  })

  it('limit caps linked records', () => {
    // old-proj has 2 linked at depth 1. Limit=2 means 1 anchor + 1 linked
    const limited = getContext(db, { record_id: 'id-old-proj', limit: 2 })
    const hasOld = limited.includes('Old Idea')
    const hasNew = limited.includes('New Idea')
    // Only one of the two should appear
    expect(hasOld && hasNew).toBe(false)
    expect(hasOld || hasNew).toBe(true)
  })

  it('limit smaller than anchor count still returns all anchors', () => {
    // Query with person who has 1 anchor record, set limit=1
    // Anchor should still appear even though limit=1
    const result = getContext(db, { record_id: 'id-old-proj', limit: 1 })
    expect(result).toContain('Old Project')
    // But linked records should be empty since remaining=0
    expect(result).toContain('(none)')
  })

  it('since + depth 2 + limit combined', () => {
    const result = getContext(db, {
      record_id: 'id-old-proj',
      since: '2026-03-01',
      depth: 2,
      limit: 3, // 1 anchor + 2 linked max
    })
    expect(result).toContain('Old Project')
    expect(result).toContain('New Idea')
    expect(result).not.toContain('Old Idea')
    // depth2 note should be reachable via depth 2
    expect(result).toContain('Depth 2 Note')
  })
})

describe('get_context performance', () => {
  it('depth-2 query under 100ms with 500 seeded links', () => {
    const insert = db.prepare(`
      INSERT INTO records (id, log_type, title, text, capture_date, source_origin, tags, created_at, updated_at)
      VALUES (?, 'idea', ?, 'Perf test record', '2026-03-25', 'mustard-mcp', '[]', '2026-03-25 10:00:00', '2026-03-25 10:00:00')
    `)
    const insertLink = db.prepare(`
      INSERT INTO links (id, source_id, target_id, relation, created_at)
      VALUES (?, ?, ?, 'perf_test', '2026-03-25 10:00:00')
    `)

    const txn = db.transaction(() => {
      insert.run('perf-hub', 'Perf Hub')
      for (let i = 0; i < 250; i++) {
        const id = `perf-d1-${i}`
        insert.run(id, `Perf D1 ${i}`)
        insertLink.run(`perf-lk-d1-${i}`, 'perf-hub', id)
      }
      for (let i = 0; i < 250; i++) {
        const id = `perf-d2-${i}`
        insert.run(id, `Perf D2 ${i}`)
        insertLink.run(`perf-lk-d2-${i}`, `perf-d1-${i}`, id)
      }
    })
    txn()

    const start = performance.now()
    const result = getContext(db, { record_id: 'perf-hub', depth: 2 })
    const elapsed = performance.now() - start

    // Log actual timing for honest reporting
    console.log(`Depth-2 with 500 links: ${elapsed.toFixed(1)}ms`)

    expect(result).toContain('Perf Hub')
    expect(result).toContain('Perf D1')
    expect(result).toContain('Perf D2')
    expect(elapsed).toBeLessThan(100)
  })
})

describe('project_summary', () => {
  beforeAll(() => {
    const insert = db.prepare(`
      INSERT INTO records (id, log_type, title, text, capture_date, person, status, due_date, source_origin, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'mustard-mcp', '[]', ?, ?)
    `)

    insert.run('id-sum-proj', 'project', 'Summary Project', 'For summary tests', '2026-03-25', null, 'open', null, '2026-03-25 10:00:00', '2026-03-25 10:00:00')
    insert.run('id-sum-person', 'people_note', null, 'Alice is the lead', '2026-03-25', 'alice', 'logged', null, '2026-03-25 10:00:00', '2026-03-25 10:00:00')
    insert.run('id-sum-todo-open', 'todo', 'Ship v2', 'Release new version', '2026-03-25', null, 'open', '2026-03-30', '2026-03-25 10:00:00', '2026-03-25 10:00:00')
    insert.run('id-sum-todo-done', 'todo', 'Write tests', 'Test coverage', '2026-03-25', null, 'done', '2026-03-24', '2026-03-25 10:00:00', '2026-03-25 10:00:00')
    insert.run('id-sum-idea', 'idea', 'Auto-linking', 'Detect context automatically', '2026-03-25', null, 'open', null, '2026-03-25 10:00:00', '2026-03-25 10:00:00')
    // Old record — outside 7-day window from 2026-03-25
    insert.run('id-sum-old', 'daily_log', null, 'Old activity', '2026-01-01', null, 'logged', null, '2026-01-01 10:00:00', '2026-01-01 10:00:00')

    linkRecords(db, { source_id: 'id-sum-person', target_id: 'id-sum-proj', relation: 'member_of' })
    linkRecords(db, { source_id: 'id-sum-todo-open', target_id: 'id-sum-proj', relation: 'assigned_to' })
    linkRecords(db, { source_id: 'id-sum-todo-done', target_id: 'id-sum-proj', relation: 'assigned_to' })
    linkRecords(db, { source_id: 'id-sum-idea', target_id: 'id-sum-proj', relation: 'related_to' })
    linkRecords(db, { source_id: 'id-sum-old', target_id: 'id-sum-proj', relation: 'related_to' })
  })

  it('returns 4 structured sections by record_id', () => {
    const result = projectSummary(db, { record_id: 'id-sum-proj', reference_date: '2026-03-25' })
    expect(result).toContain('# Project Summary')
    expect(result).toContain('## Team')
    expect(result).toContain('## Open Todos')
    expect(result).toContain('## Recent Activity')
    expect(result).toContain('## Linked Ideas')
  })

  it('returns structured sections by title', () => {
    const result = projectSummary(db, { title: 'Summary', reference_date: '2026-03-25' })
    expect(result).toContain('Summary Project')
  })

  it('shows team with count', () => {
    const result = projectSummary(db, { record_id: 'id-sum-proj', reference_date: '2026-03-25' })
    expect(result).toContain('## Team (1)')
    expect(result).toContain('alice')
  })

  it('shows record preview with title, date, status', () => {
    const result = projectSummary(db, { record_id: 'id-sum-proj', reference_date: '2026-03-25' })
    expect(result).toContain('**Ship v2**')
    expect(result).toContain('2026-03-25')
    expect(result).toContain('open')
  })

  it('recent activity uses deterministic reference_date', () => {
    const result = projectSummary(db, { record_id: 'id-sum-proj', reference_date: '2026-03-25' })
    // Old activity from Jan 1 should NOT be recent (outside 7-day window from March 25)
    const recentSection = result.split('## Recent Activity')[1]?.split('## Linked Ideas')[0] ?? ''
    expect(recentSection).not.toContain('Old activity')
    // But recent records should be there
    expect(recentSection).toContain('alice')
  })

  it('unknown project by title returns "not found"', () => {
    const result = projectSummary(db, { title: 'Totally Nonexistent ZZZ' })
    expect(result).toContain('Project not found')
  })

  it('unknown project by record_id returns "not found"', () => {
    const result = projectSummary(db, { record_id: '00000000-0000-0000-0000-000000000000' })
    expect(result).toContain('Project not found')
  })

  it('empty project shows all sections with (none)', () => {
    db.prepare(`
      INSERT INTO records (id, log_type, title, text, capture_date, source_origin, tags, created_at, updated_at)
      VALUES ('id-empty-proj', 'project', 'Empty Project', 'No links', '2026-03-25', 'mustard-mcp', '[]', '2026-03-25 10:00:00', '2026-03-25 10:00:00')
    `).run()

    const result = projectSummary(db, { record_id: 'id-empty-proj', reference_date: '2026-03-25' })
    expect(result).toContain('## Team (0)')
    expect(result).toContain('## Open Todos (0)')
    expect(result).toContain('## Recent Activity (0)')
    expect(result).toContain('## Linked Ideas (0)')
    const noneCount = (result.match(/\(none\)/g) ?? []).length
    expect(noneCount).toBeGreaterThanOrEqual(4)
  })

  it('done todos do NOT appear in Open Todos section', () => {
    const result = projectSummary(db, { record_id: 'id-sum-proj', reference_date: '2026-03-25' })
    expect(result).toContain('## Open Todos (1)')
    expect(result).toContain('Ship v2')
    // "Write tests" is done — should NOT be in Open Todos
    const openSection = result.split('## Open Todos')[1]?.split('##')[0] ?? ''
    expect(openSection).not.toContain('Write tests')
  })
})

describe('migration — project type on old schema', () => {
  it('migrates an existing DB without project in CHECK and preserves data', () => {
    const migrationDbPath = path.join(os.tmpdir(), `mustard-migration-${Date.now()}.db`)
    const migrationDb = new Database(migrationDbPath)
    migrationDb.pragma('journal_mode = WAL')
    migrationDb.pragma('foreign_keys = ON')

    // Create OLD schema (without 'project')
    migrationDb.exec(`
      CREATE TABLE records (
        id              TEXT PRIMARY KEY,
        log_type        TEXT NOT NULL CHECK(log_type IN ('todo','people_note','idea','daily_log')),
        title           TEXT,
        text            TEXT NOT NULL,
        capture_date    TEXT NOT NULL,
        person          TEXT,
        status          TEXT,
        due_date        TEXT,
        category        TEXT,
        theme           TEXT,
        period          TEXT,
        source_origin   TEXT NOT NULL DEFAULT 'mustard-app',
        source_date     TEXT,
        tags            TEXT NOT NULL DEFAULT '[]',
        confidence      TEXT,
        created_by      TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    // Insert a record under old schema
    migrationDb.prepare(`
      INSERT INTO records (id, log_type, title, text, capture_date, source_origin, tags, created_at, updated_at)
      VALUES ('old-todo-1', 'todo', 'Old Todo', 'Existed before migration', '2026-01-01', 'mustard-app', '[]', '2026-01-01 10:00:00', '2026-01-01 10:00:00')
    `).run()

    // Run initSchema — should migrate
    initSchema(migrationDb)

    // Verify old data survived
    const oldRow = migrationDb.prepare('SELECT * FROM records WHERE id = ?').get('old-todo-1') as { title: string } | undefined
    expect(oldRow).toBeTruthy()
    expect(oldRow!.title).toBe('Old Todo')

    // Verify project type now works
    migrationDb.prepare(`
      INSERT INTO records (id, log_type, title, text, capture_date, source_origin, tags, created_at, updated_at)
      VALUES ('new-proj-1', 'project', 'New Project', 'Created after migration', '2026-03-27', 'mustard-mcp', '[]', '2026-03-27 10:00:00', '2026-03-27 10:00:00')
    `).run()

    const projRow = migrationDb.prepare('SELECT * FROM records WHERE id = ?').get('new-proj-1') as { log_type: string } | undefined
    expect(projRow).toBeTruthy()
    expect(projRow!.log_type).toBe('project')

    // Verify FTS works after migration
    const ftsExists = migrationDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='records_fts'").get()
    expect(ftsExists).toBeTruthy()

    migrationDb.close()
    try { fs.unlinkSync(migrationDbPath) } catch { /* ignore */ }
    try { fs.unlinkSync(migrationDbPath + '-wal') } catch { /* ignore */ }
    try { fs.unlinkSync(migrationDbPath + '-shm') } catch { /* ignore */ }
  })

  it('initSchema is idempotent — running twice does not error or lose data', () => {
    const idempotentDbPath = path.join(os.tmpdir(), `mustard-idempotent-${Date.now()}.db`)
    const idempotentDb = new Database(idempotentDbPath)
    idempotentDb.pragma('journal_mode = WAL')
    idempotentDb.pragma('foreign_keys = ON')

    // First run
    initSchema(idempotentDb)

    // Insert data
    idempotentDb.prepare(`
      INSERT INTO records (id, log_type, title, text, capture_date, source_origin, tags, created_at, updated_at)
      VALUES ('idem-1', 'project', 'Idem Project', 'Idempotency test', '2026-03-27', 'mustard-mcp', '[]', '2026-03-27 10:00:00', '2026-03-27 10:00:00')
    `).run()

    // Second run — should NOT error or lose data
    initSchema(idempotentDb)

    const row = idempotentDb.prepare('SELECT * FROM records WHERE id = ?').get('idem-1') as { title: string } | undefined
    expect(row).toBeTruthy()
    expect(row!.title).toBe('Idem Project')

    // Verify count is still 1
    const count = (idempotentDb.prepare('SELECT COUNT(*) as cnt FROM records').get() as { cnt: number }).cnt
    expect(count).toBe(1)

    idempotentDb.close()
    try { fs.unlinkSync(idempotentDbPath) } catch { /* ignore */ }
    try { fs.unlinkSync(idempotentDbPath + '-wal') } catch { /* ignore */ }
    try { fs.unlinkSync(idempotentDbPath + '-shm') } catch { /* ignore */ }
  })
})

describe('daily_summary', () => {
  it('returns summary for a specific date', () => {
    const result = dailySummary(db, '2026-03-25')
    expect(result).toContain('Daily Summary')
    expect(result).toContain('2026-03-25')
  })

  it('shows overdue todos', () => {
    const result = dailySummary(db, '2026-03-25')
    expect(result).toContain('Overdue')
    expect(result).toContain('Fix CI pipeline')
  })

  it('shows open todos', () => {
    const result = dailySummary(db, '2026-03-25')
    expect(result).toContain('Open Todos')
  })

  it('shows today logs', () => {
    const result = dailySummary(db, '2026-03-25')
    expect(result).toContain('Logs')
    expect(result).toContain('MCP migration')
  })

  it('shows recent notes and ideas', () => {
    const result = dailySummary(db, '2026-03-25')
    expect(result).toContain('Recent Notes')
  })
})

// Phase 4 — Learning type, source_url, delegate tests

describe('learning records', () => {
  let learningId: string

  it('creates a learning record with source_url', () => {
    const result = createRecord(db, {
      log_type: 'learning',
      text: 'Key insight: spaced repetition improves retention by 200%',
      title: 'Spaced Repetition Research',
      status: 'captured',
      source_url: 'https://example.com/spaced-repetition',
      tags: ['learning-science', 'retention'],
    })
    expect(result).toContain('created successfully')
    expect(result).toContain('learning')
    expect(result).toContain('https://example.com/spaced-repetition')
    const idMatch = result.match(/ID: ([a-f0-9-]+)/)
    expect(idMatch).toBeTruthy()
    learningId = idMatch![1]
  })

  it('FTS indexes learning records', () => {
    const result = searchRecords(db, { query: 'spaced repetition' })
    expect(result).toContain('Spaced Repetition Research')
  })

  it('FTS indexes source_url for URL search', () => {
    const result = searchRecords(db, { query: '"example.com"' })
    expect(result).toContain('Spaced Repetition Research')
  })

  it('type filter isolates learnings', () => {
    const result = listRecords(db, { type: 'learning' })
    expect(result).toContain('Spaced Repetition Research')
    expect(result).not.toContain('Buy groceries')
  })

  it('status lifecycle: captured → processed → applied', () => {
    updateRecord(db, { id: learningId, status: 'processed' })
    let row = getRecord(db, learningId)
    expect(row).toContain('processed')

    updateRecord(db, { id: learningId, status: 'applied' })
    row = getRecord(db, learningId)
    expect(row).toContain('applied')
  })

  it('appears in daily summary recent notes', () => {
    // Create a learning with today's capture date
    createRecord(db, {
      log_type: 'learning',
      text: 'Article about testing strategies',
      title: 'Testing Strategies',
      status: 'captured',
    })
    const result = dailySummary(db, new Date().toISOString().slice(0, 10))
    expect(result).toContain('Testing Strategies')
  })
})

describe('source_url field', () => {
  it('displays URL in formatted output', () => {
    const result = createRecord(db, {
      log_type: 'idea',
      text: 'Idea from an article about RAG patterns',
      title: 'RAG Patterns',
      source_url: 'https://example.com/rag-patterns',
    })
    expect(result).toContain('URL: https://example.com/rag-patterns')
  })

  it('updates source_url', () => {
    const created = createRecord(db, {
      log_type: 'todo',
      text: 'Read this article',
      source_url: 'https://example.com/old',
    })
    const id = created.match(/ID: ([a-f0-9-]+)/)![1]
    const updated = updateRecord(db, { id, source_url: 'https://example.com/new' })
    expect(updated).toContain('URL: https://example.com/new')
  })

  it('clears source_url with null', () => {
    const created = createRecord(db, {
      log_type: 'todo',
      text: 'URL clear test',
      source_url: 'https://example.com/clear',
    })
    const id = created.match(/ID: ([a-f0-9-]+)/)![1]
    const updated = updateRecord(db, { id, source_url: null })
    expect(updated).not.toContain('URL:')
  })
})

describe('delegate field', () => {
  it('creates record with delegate=agent', () => {
    const result = createRecord(db, {
      log_type: 'todo',
      text: 'Auto-check CI status daily',
      delegate: 'agent',
      status: 'open',
    })
    expect(result).toContain('Delegate: agent')
  })

  it('filters by delegate in list_records', () => {
    const agentList = listRecords(db, { type: 'todo', delegate: 'agent' })
    expect(agentList).toContain('Auto-check CI status')

    const humanList = listRecords(db, { type: 'todo', delegate: null })
    expect(humanList).not.toContain('Auto-check CI status')
    expect(humanList).toContain('Buy groceries')
  })

  it('updates delegate', () => {
    const created = createRecord(db, {
      log_type: 'todo',
      text: 'Delegate update test',
      delegate: 'assisted',
    })
    const id = created.match(/ID: ([a-f0-9-]+)/)![1]
    const updated = updateRecord(db, { id, delegate: 'agent' })
    expect(updated).toContain('Delegate: agent')
  })

  it('clears delegate with null', () => {
    const created = createRecord(db, {
      log_type: 'todo',
      text: 'Delegate clear test',
      delegate: 'agent',
    })
    const id = created.match(/ID: ([a-f0-9-]+)/)![1]
    const updated = updateRecord(db, { id, delegate: null })
    expect(updated).not.toContain('Delegate:')
  })
})

describe('migration — learning type + new columns on old schema', () => {
  it('migrates old schema to include learning type and new columns', () => {
    const migrationDbPath = path.join(os.tmpdir(), `mustard-learning-mig-${Date.now()}.db`)
    const migrationDb = new Database(migrationDbPath)
    migrationDb.pragma('journal_mode = WAL')
    migrationDb.pragma('foreign_keys = ON')

    // Create old schema (with project but without learning/source_url/delegate)
    migrationDb.exec(`
      CREATE TABLE records (
        id              TEXT PRIMARY KEY,
        log_type        TEXT NOT NULL CHECK(log_type IN ('todo','people_note','idea','daily_log','project')),
        title           TEXT,
        text            TEXT NOT NULL,
        capture_date    TEXT NOT NULL,
        person          TEXT,
        status          TEXT,
        due_date        TEXT,
        category        TEXT,
        theme           TEXT,
        period          TEXT,
        source_origin   TEXT NOT NULL DEFAULT 'mustard-app',
        source_date     TEXT,
        tags            TEXT NOT NULL DEFAULT '[]',
        confidence      TEXT,
        created_by      TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    migrationDb.prepare(`
      INSERT INTO records (id, log_type, title, text, capture_date, source_origin, tags)
      VALUES ('old-1', 'todo', 'Old Todo', 'Before migration', '2026-01-01', 'mustard-app', '[]')
    `).run()

    initSchema(migrationDb)

    // Old data preserved
    const old = migrationDb.prepare('SELECT * FROM records WHERE id = ?').get('old-1') as Record<string, unknown>
    expect(old.title).toBe('Old Todo')
    expect(old.source_url).toBeNull()
    expect(old.delegate).toBeNull()

    // Learning type works
    migrationDb.prepare(`
      INSERT INTO records (id, log_type, title, text, capture_date, source_origin, tags, source_url)
      VALUES ('learn-1', 'learning', 'Test Learning', 'Content', '2026-03-29', 'mustard-mcp', '[]', 'https://example.com')
    `).run()
    const learn = migrationDb.prepare('SELECT * FROM records WHERE id = ?').get('learn-1') as Record<string, unknown>
    expect(learn.log_type).toBe('learning')
    expect(learn.source_url).toBe('https://example.com')

    // FTS includes source_url
    rebuildFts(migrationDb)
    const fts = migrationDb.prepare(`
      SELECT r.id FROM records r
      JOIN records_fts fts ON fts.rowid = r.rowid
      WHERE records_fts MATCH '"example.com"'
    `).all() as { id: string }[]
    expect(fts.some(r => r.id === 'learn-1')).toBe(true)

    migrationDb.close()
    try { fs.unlinkSync(migrationDbPath) } catch { /* ignore */ }
    try { fs.unlinkSync(migrationDbPath + '-wal') } catch { /* ignore */ }
    try { fs.unlinkSync(migrationDbPath + '-shm') } catch { /* ignore */ }
  })

  it('initSchema is idempotent with new schema', () => {
    const dbPath2 = path.join(os.tmpdir(), `mustard-idem2-${Date.now()}.db`)
    const iDb = new Database(dbPath2)
    iDb.pragma('journal_mode = WAL')
    iDb.pragma('foreign_keys = ON')

    initSchema(iDb)
    iDb.prepare(`
      INSERT INTO records (id, log_type, title, text, capture_date, source_origin, tags, source_url, delegate)
      VALUES ('idem-l', 'learning', 'Idem Learning', 'Test', '2026-03-29', 'mustard-mcp', '[]', 'https://x.com', 'agent')
    `).run()

    initSchema(iDb) // second call — must not fail

    const row = iDb.prepare('SELECT * FROM records WHERE id = ?').get('idem-l') as Record<string, unknown>
    expect(row.source_url).toBe('https://x.com')
    expect(row.delegate).toBe('agent')

    iDb.close()
    try { fs.unlinkSync(dbPath2) } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath2 + '-wal') } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath2 + '-shm') } catch { /* ignore */ }
  })
})

describe('learning + link graph integration', () => {
  it('learning linked to ideas via extracted_from', () => {
    const learning = createRecord(db, {
      log_type: 'learning',
      text: 'Article about prompt engineering best practices',
      title: 'Prompt Engineering Guide',
      source_url: 'https://example.com/prompts',
      status: 'processed',
      tags: ['ai', 'prompts'],
    })
    const learningIdMatch = learning.match(/ID: ([a-f0-9-]+)/)![1]

    const idea = createRecord(db, {
      log_type: 'idea',
      text: 'Try chain-of-thought prompting for code review',
      title: 'CoT for Code Review',
    })
    const ideaId = idea.match(/ID: ([a-f0-9-]+)/)![1]

    const linkResult = linkRecords(db, {
      source_id: ideaId,
      target_id: learningIdMatch,
      relation: 'extracted_from',
    })
    expect(linkResult).toContain('Linked')

    const context = getContext(db, { record_id: learningIdMatch })
    expect(context).toContain('CoT for Code Review')
    expect(context).toContain('extracted_from')
  })

  it('experiment todo linked via experiment_for', () => {
    const idea2 = createRecord(db, {
      log_type: 'idea',
      text: 'Structured output as control flow for agents',
      title: 'Structured Output Control',
    })
    const ideaId2 = idea2.match(/ID: ([a-f0-9-]+)/)![1]

    const todo = createRecord(db, {
      log_type: 'todo',
      text: 'Try structured output control in build-loop',
      title: 'Experiment: Structured Output',
      status: 'open',
    })
    const todoId = todo.match(/ID: ([a-f0-9-]+)/)![1]

    linkRecords(db, {
      source_id: todoId,
      target_id: ideaId2,
      relation: 'experiment_for',
    })

    const context = getContext(db, { record_id: ideaId2 })
    expect(context).toContain('Experiment: Structured Output')
    expect(context).toContain('experiment_for')
  })
})
