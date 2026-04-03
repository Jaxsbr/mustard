import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { parse as parseYaml } from 'yaml'
import { getDb, initSchema, rebuildFts, type Database } from 'mustard-core'

const DEFAULT_DATA_DIR = path.join(process.env.HOME ?? '', 'dev', 'mustard-data')

interface RawYamlRecord {
  id: string
  log_type: string
  capture_date_local?: string
  title?: string | null
  text: string
  person?: string | null
  status?: string | null
  due_date_local?: string | null
  category?: string | null
  theme?: string | null
  period?: string | null
  source?: string | { origin?: string; created_at?: string }
  meta?: {
    tags?: string[]
    confidence?: string
    created_by?: string
    created_at?: string
  }
}

interface NormalizedRecord {
  id: string
  log_type: string
  title: string | null
  text: string
  capture_date: string
  person: string | null
  status: string | null
  due_date: string | null
  category: string | null
  theme: string | null
  period: string | null
  source_origin: string
  source_date: string | null
  tags: string
  confidence: string | null
  created_by: string | null
  source_url: string | null
  delegate: string | null
  created_at: string
  updated_at: string
}

function findYamlFiles(dir: string): string[] {
  const files: string[] = []
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.yaml')) {
      const parent = entry.parentPath ?? (entry as unknown as { path?: string }).path ?? dir
      files.push(path.join(parent, entry.name))
    }
  }
  return files
}

function normalizeRecord(raw: RawYamlRecord): NormalizedRecord {
  let sourceOrigin = 'mustard-app'
  let sourceDate: string | null = null

  if (typeof raw.source === 'string') {
    sourceOrigin = raw.source
  } else if (raw.source && typeof raw.source === 'object') {
    sourceOrigin = raw.source.origin ?? 'unknown'
    sourceDate = raw.source.created_at ?? null
  }

  const tags = Array.isArray(raw.meta?.tags) ? raw.meta.tags : []
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  return {
    id: String(raw.id),
    log_type: String(raw.log_type),
    title: raw.title ?? null,
    text: String(raw.text),
    capture_date: String(raw.capture_date_local ?? now.slice(0, 10)),
    person: raw.person ?? null,
    status: raw.status ?? null,
    due_date: raw.due_date_local ?? null,
    category: raw.category ?? null,
    theme: raw.theme ?? null,
    period: raw.period ?? null,
    source_origin: sourceOrigin,
    source_date: sourceDate,
    tags: JSON.stringify(tags),
    confidence: raw.meta?.confidence ?? null,
    created_by: raw.meta?.created_by ?? null,
    source_url: null,
    delegate: null,
    created_at: raw.meta?.created_at ?? now,
    updated_at: now,
  }
}

export interface MigrationResult {
  total_yaml_files: number
  parsed_ok: number
  parse_failures: string[]
  inserted: number
  verification: VerificationResult
}

export interface VerificationResult {
  count_match: boolean
  type_distribution: Record<string, number>
  missing_ids: string[]
  text_integrity_failures: string[]
  unique_persons: string[]
  tag_round_trip_failures: string[]
  source_distribution: Record<string, number>
  fts_test_passed: boolean
  all_passed: boolean
}

export function migrate(
  dataDir: string = DEFAULT_DATA_DIR,
  dbPath?: string,
): MigrationResult {
  const resolvedDbPath = dbPath ?? path.join(dataDir, 'mustard.db')

  if (fs.existsSync(resolvedDbPath)) {
    const backup = resolvedDbPath + '.bak.' + Date.now()
    fs.copyFileSync(resolvedDbPath, backup)
    console.error(`[migrate] Backed up existing DB to ${backup}`)
  }

  const db = getDb(resolvedDbPath)
  initSchema(db)

  const yamlFiles = findYamlFiles(dataDir).filter(
    (f) => !f.includes('.git') && !f.endsWith('.db'),
  )

  const parsed: { raw: RawYamlRecord; normalized: NormalizedRecord; yamlTags: string[] }[] = []
  const parseFailures: string[] = []

  for (const filePath of yamlFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const doc = parseYaml(content) as RawYamlRecord
      if (!doc || typeof doc.text !== 'string' || !doc.id) {
        parseFailures.push(filePath)
        continue
      }
      const yamlTags = Array.isArray(doc.meta?.tags) ? doc.meta.tags : []
      parsed.push({ raw: doc, normalized: normalizeRecord(doc), yamlTags })
    } catch {
      parseFailures.push(filePath)
    }
  }

  const insert = db.prepare(`
    INSERT OR REPLACE INTO records (
      id, log_type, title, text, capture_date,
      person, status, due_date, category, theme, period,
      source_origin, source_date, tags, confidence, created_by,
      source_url, delegate, created_at, updated_at
    ) VALUES (
      @id, @log_type, @title, @text, @capture_date,
      @person, @status, @due_date, @category, @theme, @period,
      @source_origin, @source_date, @tags, @confidence, @created_by,
      @source_url, @delegate, @created_at, @updated_at
    )
  `)

  const insertAll = db.transaction(() => {
    for (const { normalized } of parsed) {
      insert.run(normalized)
    }
  })
  insertAll()

  rebuildFts(db)

  const verification = verify(db, parsed, yamlFiles.length)

  if (!verification.all_passed) {
    console.error('[migrate] VERIFICATION FAILED — review results before using this DB')
  } else {
    console.error(`[migrate] SUCCESS — ${verification.type_distribution.todo ?? 0} todos, ${verification.type_distribution.people_note ?? 0} people_notes, ${verification.type_distribution.daily_log ?? 0} daily_logs, ${verification.type_distribution.idea ?? 0} ideas`)
  }

  db.close()

  return {
    total_yaml_files: yamlFiles.length,
    parsed_ok: parsed.length,
    parse_failures: parseFailures,
    inserted: parsed.length,
    verification,
  }
}

function verify(
  db: Database.Database,
  parsed: { raw: RawYamlRecord; normalized: NormalizedRecord; yamlTags: string[] }[],
  totalYamlFiles: number,
): VerificationResult {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM records').get() as { cnt: number }
  const countMatch = countRow.cnt === parsed.length

  const typeRows = db
    .prepare('SELECT log_type, COUNT(*) as cnt FROM records GROUP BY log_type')
    .all() as { log_type: string; cnt: number }[]
  const typeDistribution: Record<string, number> = {}
  for (const row of typeRows) {
    typeDistribution[row.log_type] = row.cnt
  }

  const dbIds = new Set(
    (db.prepare('SELECT id FROM records').all() as { id: string }[]).map((r) => r.id),
  )
  const missingIds = parsed.filter((p) => !dbIds.has(p.normalized.id)).map((p) => p.normalized.id)

  const textIntegrityFailures: string[] = []
  for (const { normalized } of parsed) {
    const dbRow = db.prepare('SELECT text FROM records WHERE id = ?').get(normalized.id) as
      | { text: string }
      | undefined
    if (!dbRow) {
      textIntegrityFailures.push(normalized.id)
      continue
    }
    const yamlHash = crypto.createHash('sha256').update(normalized.text).digest('hex')
    const dbHash = crypto.createHash('sha256').update(dbRow.text).digest('hex')
    if (yamlHash !== dbHash) {
      textIntegrityFailures.push(normalized.id)
    }
  }

  const personRows = db
    .prepare('SELECT DISTINCT person FROM records WHERE person IS NOT NULL')
    .all() as { person: string }[]
  const uniquePersons = personRows.map((r) => r.person).sort()

  const tagRoundTripFailures: string[] = []
  for (const { normalized, yamlTags } of parsed) {
    const dbRow = db.prepare('SELECT tags FROM records WHERE id = ?').get(normalized.id) as
      | { tags: string }
      | undefined
    if (!dbRow) {
      tagRoundTripFailures.push(normalized.id)
      continue
    }
    const dbTags = JSON.parse(dbRow.tags) as string[]
    if (JSON.stringify(yamlTags.sort()) !== JSON.stringify(dbTags.sort())) {
      tagRoundTripFailures.push(normalized.id)
    }
  }

  const sourceRows = db
    .prepare('SELECT source_origin, COUNT(*) as cnt FROM records GROUP BY source_origin')
    .all() as { source_origin: string; cnt: number }[]
  const sourceDistribution: Record<string, number> = {}
  for (const row of sourceRows) {
    sourceDistribution[row.source_origin] = row.cnt
  }

  let ftsTestPassed = false
  try {
    const ftsRows = db
      .prepare(
        `SELECT r.id FROM records r
         JOIN records_fts fts ON fts.rowid = r.rowid
         WHERE records_fts MATCH 'tatai'`,
      )
      .all() as { id: string }[]
    ftsTestPassed = ftsRows.length > 0
  } catch {
    ftsTestPassed = false
  }

  const allPassed =
    countMatch &&
    missingIds.length === 0 &&
    textIntegrityFailures.length === 0 &&
    tagRoundTripFailures.length === 0 &&
    ftsTestPassed

  return {
    count_match: countMatch,
    type_distribution: typeDistribution,
    missing_ids: missingIds,
    text_integrity_failures: textIntegrityFailures,
    unique_persons: uniquePersons,
    tag_round_trip_failures: tagRoundTripFailures,
    source_distribution: sourceDistribution,
    fts_test_passed: ftsTestPassed,
    all_passed: allPassed,
  }
}

if (process.argv[1]?.endsWith('migrate.js') || process.argv[1]?.endsWith('migrate.ts')) {
  const dataDir = process.argv[2] ?? DEFAULT_DATA_DIR
  console.error(`[migrate] Migrating YAML from ${dataDir}`)
  const result = migrate(dataDir)
  console.log(JSON.stringify(result, null, 2))
}
