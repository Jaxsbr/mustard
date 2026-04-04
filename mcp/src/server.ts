// CI verification — remove after confirming checks
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getDb, initSchema,
  getRecord, createRecord, updateRecord, deleteRecord,
  searchRecords, listRecords,
  linkRecords, unlinkRecords,
  getContext, dailySummary, projectSummary,
} from 'mustard-core'
import {
  formatGetRecord, formatCreateRecord, formatUpdateRecord, formatDeleteRecord,
  formatSearchResults, formatListResults,
  formatLinkResult, formatUnlinkResult,
  formatContext, formatDailySummary, formatProjectSummary,
} from './format.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.resolve(__dirname, '..', '..')
const dbPath = process.env.MUSTARD_DB || path.join(monorepoRoot, 'data', 'mustard.db')

const server = new McpServer({
  name: 'mustard',
  version: '1.0.0',
})

const db = getDb(dbPath)
initSchema(db)

server.tool(
  'search_records',
  'Full-text search across all records. Use for natural language queries like "notes about tatai", "ai upskilling", "coaching insights".',
  {
    query: z.string().describe('Search query text'),
    type: z
      .enum(['todo', 'people_note', 'idea', 'daily_log', 'project', 'learning'])
      .optional()
      .describe('Filter by record type'),
    person: z.string().optional().describe('Filter by person slug (e.g. tatai, sway)'),
    status: z.string().optional().describe('Filter by status (e.g. open, done)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max results to return (default 10)'),
  },
  async ({ query, type, person, status, limit }) => {
    const results = searchRecords(db, { query, type, person, status, limit })
    return { content: [{ type: 'text' as const, text: formatSearchResults(results, query) }] }
  },
)

server.tool(
  'list_records',
  'Browse and list records by type, person, or status. Use for "show all open todos", "list people notes for sway", "recent daily logs", "list projects".',
  {
    type: z
      .enum(['todo', 'people_note', 'idea', 'daily_log', 'project', 'learning'])
      .optional()
      .describe('Filter by record type'),
    person: z.string().optional().describe('Filter by person slug'),
    status: z.string().optional().describe('Filter by status'),
    delegate: z
      .string()
      .nullable()
      .optional()
      .describe('Filter by delegate (null for human, "agent", "assisted")'),
    sort: z
      .enum(['newest', 'oldest'])
      .optional()
      .describe('Sort order by capture date (default newest)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Max results (default 25)'),
  },
  async ({ type, person, status, delegate, sort, limit }) => {
    const { records, total } = listRecords(db, { type, person, status, delegate, sort, limit })
    return { content: [{ type: 'text' as const, text: formatListResults(records, total, { type, person, status }) }] }
  },
)

server.tool(
  'get_record',
  'Fetch a single record by its UUID. Use when you have a specific record ID.',
  {
    id: z.string().uuid().describe('Record UUID'),
  },
  async ({ id }) => {
    const record = getRecord(db, id)
    return { content: [{ type: 'text' as const, text: formatGetRecord(record, id) }] }
  },
)

server.tool(
  'create_record',
  'Create a new record (todo, people note, idea, daily log, project, or learning).',
  {
    log_type: z
      .enum(['todo', 'people_note', 'idea', 'daily_log', 'project', 'learning'])
      .describe('Type of record to create'),
    text: z.string().min(1).describe('Main content text'),
    title: z.string().optional().describe('Optional short title'),
    person: z.string().optional().describe('Person slug (for people_note)'),
    status: z.string().optional().describe('Status (e.g. open, done, exploring, captured, processed, applied)'),
    due_date: z.string().optional().describe('Due date YYYY-MM-DD (for todo)'),
    category: z.string().optional().describe('Category (for todo)'),
    theme: z.string().optional().describe('Theme (for daily_log)'),
    period: z.string().optional().describe('Period (for daily_log)'),
    tags: z.array(z.string()).optional().describe('Tags array'),
    source_url: z.string().optional().describe('URL of external content (article, video, reference)'),
    delegate: z
      .enum(['agent', 'assisted'])
      .nullable()
      .optional()
      .describe('Delegation mode: null (human), "agent" (automated), "assisted" (agent prep, human review)'),
  },
  async (params) => {
    try {
      const record = createRecord(db, { ...params, source_origin: 'mustard-mcp' })
      return { content: [{ type: 'text' as const, text: formatCreateRecord(record) }] }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text' as const, text: message }] }
    }
  },
)

server.tool(
  'update_record',
  'Update fields on an existing record. Only provide fields you want to change.',
  {
    id: z.string().uuid().describe('Record UUID to update'),
    text: z.string().optional().describe('New text content'),
    title: z.string().nullable().optional().describe('New title (null to clear)'),
    person: z.string().nullable().optional().describe('New person slug'),
    status: z.string().nullable().optional().describe('New status'),
    due_date: z.string().nullable().optional().describe('New due date YYYY-MM-DD'),
    category: z.string().nullable().optional().describe('New category'),
    theme: z.string().nullable().optional().describe('New theme'),
    period: z.string().nullable().optional().describe('New period'),
    tags: z.array(z.string()).optional().describe('New tags array'),
    source_url: z.string().nullable().optional().describe('URL of external content (null to clear)'),
    delegate: z
      .enum(['agent', 'assisted'])
      .nullable()
      .optional()
      .describe('Delegation mode (null to clear)'),
  },
  async ({ id, ...rest }) => {
    try {
      const hasUpdates = Object.values(rest).some(v => v !== undefined)
      if (!hasUpdates) {
        return { content: [{ type: 'text' as const, text: 'No fields to update.' }] }
      }
      const record = updateRecord(db, { id, ...rest })
      return { content: [{ type: 'text' as const, text: formatUpdateRecord(record) }] }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text' as const, text: message }] }
    }
  },
)

server.tool(
  'delete_record',
  'Delete a record by UUID. This is permanent.',
  {
    id: z.string().uuid().describe('Record UUID to delete'),
  },
  async ({ id }) => {
    try {
      const deleted = deleteRecord(db, id)
      return { content: [{ type: 'text' as const, text: formatDeleteRecord(deleted) }] }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text' as const, text: message }] }
    }
  },
)

server.tool(
  'link_records',
  'Create a typed connection between two mustard records. Idempotent — safe to call if link already exists. Self-links are rejected.',
  {
    source_id: z.string().uuid().describe('UUID of the source record'),
    target_id: z.string().uuid().describe('UUID of the target record'),
    relation: z
      .string()
      .min(1)
      .describe(
        'Relationship type (freeform). Recommended: "member_of", "assigned_to", "related_to", "inspired_by", "blocked_by"',
      ),
  },
  async ({ source_id, target_id, relation }) => {
    try {
      const sourceRec = getRecord(db, source_id)
      const targetRec = getRecord(db, target_id)
      const sourceLabel = sourceRec ? (sourceRec.title ?? sourceRec.log_type) : source_id
      const targetLabel = targetRec ? (targetRec.title ?? targetRec.log_type) : target_id

      // Pre-check for idempotent detection
      const existed = !!db.prepare('SELECT 1 FROM links WHERE source_id = ? AND target_id = ? AND relation = ?')
        .get(source_id, target_id, relation)

      const link = linkRecords(db, { source_id, target_id, relation })
      return { content: [{ type: 'text' as const, text: formatLinkResult(link, sourceLabel, targetLabel, existed) }] }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text' as const, text: message }] }
    }
  },
)

server.tool(
  'unlink_records',
  'Remove a connection between two mustard records.',
  {
    source_id: z.string().uuid().describe('UUID of the source record'),
    target_id: z.string().uuid().describe('UUID of the target record'),
    relation: z.string().min(1).describe('Relationship type to remove'),
  },
  async ({ source_id, target_id, relation }) => {
    const { changes } = unlinkRecords(db, { source_id, target_id, relation })
    return { content: [{ type: 'text' as const, text: formatUnlinkResult(changes, { source_id, target_id, relation }) }] }
  },
)

server.tool(
  'get_context',
  'Retrieve a record and all its linked records. Supports depth control, date filtering, and result limiting.',
  {
    record_id: z.string().uuid().optional().describe('UUID of the record to get context for'),
    person: z.string().optional().describe('Person slug — finds all records for this person plus their links'),
    project: z
      .string()
      .optional()
      .describe('Project title (partial match) — finds project records plus their links'),
    since: z
      .string()
      .optional()
      .describe('Filter linked records to those created/updated after this date (YYYY-MM-DD). Does not filter anchors.'),
    depth: z
      .number()
      .int()
      .min(1)
      .max(2)
      .optional()
      .describe('Link traversal depth: 1 (default) or 2 (links-of-links)'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Cap total returned records (anchors always included, limit applies to linked)'),
  },
  async ({ record_id, person, project, since, depth, limit }) => {
    const result = getContext(db, { record_id, person, project, since, depth, limit })
    return { content: [{ type: 'text' as const, text: formatContext(result.anchors, result.linked) }] }
  },
)

server.tool(
  'project_summary',
  'Structured overview of a project: team, open todos, recent activity (7 days), and linked ideas. Use for "catch me up on project X".',
  {
    record_id: z.string().uuid().optional().describe('Project record UUID'),
    title: z.string().optional().describe('Project title (partial match)'),
  },
  async ({ record_id, title }) => {
    const result = projectSummary(db, { record_id, title })
    return { content: [{ type: 'text' as const, text: formatProjectSummary(result, { record_id, title }) }] }
  },
)

server.tool(
  'daily_summary',
  'Get a daily overview: overdue todos, todos due today, open todos, today\'s logs, and recent notes/ideas from the last 7 days. Perfect for "what\'s on my plate today?".',
  {
    date: z
      .string()
      .optional()
      .describe('Date in YYYY-MM-DD format (defaults to today)'),
  },
  async ({ date }) => {
    const result = dailySummary(db, date)
    return { content: [{ type: 'text' as const, text: formatDailySummary(result) }] }
  },
)

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Mustard MCP server running on stdio')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
