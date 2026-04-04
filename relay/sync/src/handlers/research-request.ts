import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import crypto from 'node:crypto'
import type { RelayMessage } from '../../../contracts/types.js'
import type { ResearchRequestPayload } from '../../../contracts/research-request.js'

function getPulseDataPath(): string {
  return process.env.PULSE_DATA_PATH ?? join(homedir(), 'dev', 'pulse', 'data')
}

export async function handleResearchRequest(message: RelayMessage): Promise<string> {
  const payload = message.payload as ResearchRequestPayload
  const entryId = crypto.randomBytes(6).toString('hex')

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
    id: entryId,
    tags: payload.tags ?? [],
    urls: [],
  })

  writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n')

  return entryId
}
