import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { getDb, initSchema, createRecord, closeDb } from 'mustard-core'
import type { RelayMessage } from '../../../contracts/types.js'
import type { ResearchRequestPayload } from '../../../contracts/research-request.js'

function getPulseDataPath(): string {
  return process.env.PULSE_DATA_PATH ?? join(homedir(), 'dev', 'pulse', 'data')
}

// Assumes this file lives at relay/sync/src/handlers/ — 4 levels below monorepo root.
// If this file moves, update the relative path. Use MUSTARD_DB env var to override.
function getDbPath(): string {
  if (process.env.MUSTARD_DB) return process.env.MUSTARD_DB
  const __dirname = dirname(fileURLToPath(import.meta.url))
  return resolve(__dirname, '..', '..', '..', '..', 'data', 'mustard.db')
}

export async function handleResearchRequest(message: RelayMessage): Promise<string> {
  const payload = message.payload as ResearchRequestPayload

  // 1. Create mustard learning record
  const db = getDb(getDbPath())
  initSchema(db)

  let record
  try {
    record = createRecord(db, {
      log_type: 'learning',
      source_origin: 'mustard-relay',
      source_url: payload.url,
      text: payload.relevance_note,
      status: 'captured',
      tags: payload.tags,
    })
  } finally {
    closeDb(db)
  }

  // 2. Append to pulse research-queue.json
  try {
    const queuePath = join(getPulseDataPath(), 'research-queue.json')
    let queue: unknown[] = []
    if (existsSync(queuePath)) {
      queue = JSON.parse(readFileSync(queuePath, 'utf-8'))
    }

    queue.push({
      link: payload.url,
      summary: payload.relevance_note,
      source: 'relay',
      queued_at: new Date().toISOString(),
      status: 'pending',
      id: crypto.randomBytes(6).toString('hex'),
      tags: payload.tags ?? [],
      urls: [],
    })

    writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n')
  } catch (err) {
    console.warn(
      `[relay] Pulse queue write failed (mustard record ${record.id} preserved):`,
      (err as Error).message,
    )
  }

  return record.id
}
