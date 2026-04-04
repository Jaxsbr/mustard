#!/usr/bin/env node
// CI verification — remove after confirming checks

import { parseArgs } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getDb, initSchema,
  getRecord, createRecord, updateRecord, deleteRecord,
  searchRecords, listRecords,
  linkRecords, unlinkRecords,
  getContext, dailySummary, projectSummary,
  type RecordRow, type LinkedRecord,
  type DailySummaryResult, type ProjectSummaryResult,
} from 'mustard-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.resolve(__dirname, '..', '..')
const dbPath = process.env.MUSTARD_DB || path.join(monorepoRoot, 'data', 'mustard.db')

const SUBCOMMANDS = [
  'create', 'get', 'update', 'delete',
  'search', 'list',
  'link', 'unlink',
  'context', 'daily', 'project',
]

const USAGE = `Usage: mustard <command> [options]

Commands:
  create   Create a new record
  get      Fetch a record by ID
  update   Update an existing record
  delete   Delete a record by ID
  search   Full-text search records
  list     List records with filters
  link     Link two records
  unlink   Remove a link between records
  context  Get a record with linked context
  daily    Show daily summary
  project  Show project summary

Run "mustard <command> --help" for command-specific options.`

function openDb() {
  const db = getDb(dbPath)
  initSchema(db)
  return db
}

function formatRecord(r: RecordRow): string {
  const lines: string[] = [
    `ID:       ${r.id}`,
    `Type:     ${r.log_type}`,
  ]
  if (r.title) lines.push(`Title:    ${r.title}`)
  lines.push(`Text:     ${r.text}`)
  lines.push(`Status:   ${r.status}`)
  if (r.person) lines.push(`Person:   ${r.person}`)
  if (r.due_date) lines.push(`Due:      ${r.due_date}`)
  if (r.category) lines.push(`Category: ${r.category}`)
  if (r.theme) lines.push(`Theme:    ${r.theme}`)
  if (r.period) lines.push(`Period:   ${r.period}`)
  if (r.delegate) lines.push(`Delegate: ${r.delegate}`)
  if (r.source_url) lines.push(`URL:      ${r.source_url}`)
  if (r.tags && r.tags !== '[]') lines.push(`Tags:     ${r.tags}`)
  lines.push(`Origin:   ${r.source_origin}`)
  lines.push(`Created:  ${r.created_at}`)
  lines.push(`Updated:  ${r.updated_at}`)
  return lines.join('\n')
}

function formatRecordBrief(r: RecordRow): string {
  const title = r.title ? ` — ${r.title}` : ''
  const status = r.status ? ` [${r.status}]` : ''
  return `${r.id.slice(0, 8)}  ${r.log_type}${status}${title}`
}

function formatLinkedRecord(r: LinkedRecord): string {
  const title = r.title ? ` — ${r.title}` : ''
  return `  ${r.relation}: ${r.id.slice(0, 8)}  ${r.log_type}${title}`
}

function cmdCreate(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      type: { type: 'string' },
      text: { type: 'string' },
      title: { type: 'string' },
      person: { type: 'string' },
      status: { type: 'string' },
      'due-date': { type: 'string' },
      category: { type: 'string' },
      theme: { type: 'string' },
      period: { type: 'string' },
      tags: { type: 'string' },
      'source-url': { type: 'string' },
      delegate: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })

  if (values.help) {
    console.log(`Usage: mustard create --type <type> --text <text> [options]

Required:
  --type <type>       Record type (todo, people_note, idea, daily_log, project, learning)
  --text <text>       Record body text

Optional:
  --title <title>     Record title
  --person <slug>     Associated person
  --status <status>   Status (defaults based on type)
  --due-date <date>   Due date (YYYY-MM-DD)
  --category <cat>    Category
  --theme <theme>     Theme
  --period <period>   Period
  --tags <csv>        Comma-separated tags
  --source-url <url>  Source URL
  --delegate <slug>   Delegate`)
    return
  }

  if (!values.type) { console.error('Error: --type is required'); process.exit(1) }
  if (!values.text) { console.error('Error: --text is required'); process.exit(1) }

  const db = openDb()
  const tags = values.tags ? values.tags.split(',').map(t => t.trim()) : undefined
  const record = createRecord(db, {
    log_type: values.type,
    text: values.text,
    title: values.title,
    person: values.person,
    status: values.status,
    due_date: values['due-date'],
    category: values.category,
    theme: values.theme,
    period: values.period,
    tags,
    source_origin: 'mustard-cli',
    source_url: values['source-url'],
    delegate: values.delegate,
  })
  console.log(formatRecord(record))
  db.close()
}

function cmdGet(argv: string[]) {
  const { positionals, values } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  })

  if (values.help) {
    console.log('Usage: mustard get <id>')
    return
  }

  const id = positionals[0]
  if (!id) { console.error('Error: record ID is required'); process.exit(1) }

  const db = openDb()
  const record = getRecord(db, id)
  if (!record) { console.error(`Error: record not found: ${id}`); db.close(); process.exit(1) }
  console.log(formatRecord(record))
  db.close()
}

function cmdUpdate(argv: string[]) {
  const { positionals, values } = parseArgs({
    args: argv,
    options: {
      text: { type: 'string' },
      title: { type: 'string' },
      person: { type: 'string' },
      status: { type: 'string' },
      'due-date': { type: 'string' },
      category: { type: 'string' },
      theme: { type: 'string' },
      period: { type: 'string' },
      tags: { type: 'string' },
      'source-url': { type: 'string' },
      delegate: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  })

  if (values.help) {
    console.log(`Usage: mustard update <id> [options]

Options:
  --text <text>       Update body text
  --title <title>     Update title
  --person <slug>     Update person
  --status <status>   Update status
  --due-date <date>   Update due date
  --category <cat>    Update category
  --theme <theme>     Update theme
  --period <period>   Update period
  --tags <csv>        Update tags (comma-separated)
  --source-url <url>  Update source URL
  --delegate <slug>   Update delegate`)
    return
  }

  const id = positionals[0]
  if (!id) { console.error('Error: record ID is required'); process.exit(1) }

  const db = openDb()
  const tags = values.tags ? values.tags.split(',').map(t => t.trim()) : undefined
  const record = updateRecord(db, {
    id,
    text: values.text,
    title: values.title,
    person: values.person,
    status: values.status,
    due_date: values['due-date'],
    category: values.category,
    theme: values.theme,
    period: values.period,
    tags,
    source_url: values['source-url'],
    delegate: values.delegate,
  })
  console.log(formatRecord(record))
  db.close()
}

function cmdDelete(argv: string[]) {
  const { positionals, values } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  })

  if (values.help) {
    console.log('Usage: mustard delete <id>')
    return
  }

  const id = positionals[0]
  if (!id) { console.error('Error: record ID is required'); process.exit(1) }

  const db = openDb()
  const deleted = deleteRecord(db, id)
  console.log(`Deleted ${deleted.log_type}: ${deleted.id}${deleted.title ? ` — ${deleted.title}` : ''}`)
  db.close()
}

function cmdSearch(argv: string[]) {
  const { positionals, values } = parseArgs({
    args: argv,
    options: {
      type: { type: 'string' },
      person: { type: 'string' },
      status: { type: 'string' },
      limit: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  })

  if (values.help) {
    console.log(`Usage: mustard search <query> [options]

Options:
  --type <type>       Filter by record type
  --person <slug>     Filter by person
  --status <status>   Filter by status
  --limit <N>         Max results (default 10, max 50)`)
    return
  }

  const query = positionals[0]
  if (!query) { console.error('Error: search query is required'); process.exit(1) }

  const db = openDb()
  const results = searchRecords(db, {
    query,
    type: values.type,
    person: values.person,
    status: values.status,
    limit: values.limit ? parseInt(values.limit, 10) : undefined,
  })
  if (results.length === 0) {
    console.log('No results found.')
  } else {
    console.log(`Found ${results.length} result(s):\n`)
    for (const r of results) {
      console.log(formatRecordBrief(r))
    }
  }
  db.close()
}

function cmdList(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      type: { type: 'string' },
      person: { type: 'string' },
      status: { type: 'string' },
      delegate: { type: 'string' },
      sort: { type: 'string' },
      limit: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })

  if (values.help) {
    console.log(`Usage: mustard list [options]

Options:
  --type <type>       Filter by record type
  --person <slug>     Filter by person
  --status <status>   Filter by status
  --delegate <slug>   Filter by delegate
  --sort <order>      Sort order: newest (default), oldest
  --limit <N>         Max results (default 25, max 100)`)
    return
  }

  const db = openDb()
  const { records, total } = listRecords(db, {
    type: values.type,
    person: values.person,
    status: values.status,
    delegate: values.delegate,
    sort: values.sort === 'oldest' ? 'oldest' : 'newest',
    limit: values.limit ? parseInt(values.limit, 10) : undefined,
  })
  console.log(`Showing ${records.length} of ${total} record(s):\n`)
  for (const r of records) {
    console.log(formatRecordBrief(r))
  }
  db.close()
}

function cmdLink(argv: string[]) {
  const { positionals, values } = parseArgs({
    args: argv,
    options: {
      relation: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  })

  if (values.help) {
    console.log('Usage: mustard link <source-id> <target-id> --relation <type>')
    return
  }

  const [sourceId, targetId] = positionals
  if (!sourceId || !targetId) { console.error('Error: source and target IDs are required'); process.exit(1) }
  if (!values.relation) { console.error('Error: --relation is required'); process.exit(1) }

  const db = openDb()
  const link = linkRecords(db, { source_id: sourceId, target_id: targetId, relation: values.relation })
  console.log(`Linked ${link.source_id.slice(0, 8)} → ${link.target_id.slice(0, 8)} (${link.relation})`)
  db.close()
}

function cmdUnlink(argv: string[]) {
  const { positionals, values } = parseArgs({
    args: argv,
    options: {
      relation: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  })

  if (values.help) {
    console.log('Usage: mustard unlink <source-id> <target-id> --relation <type>')
    return
  }

  const [sourceId, targetId] = positionals
  if (!sourceId || !targetId) { console.error('Error: source and target IDs are required'); process.exit(1) }
  if (!values.relation) { console.error('Error: --relation is required'); process.exit(1) }

  const db = openDb()
  const result = unlinkRecords(db, { source_id: sourceId, target_id: targetId, relation: values.relation })
  if (result.changes > 0) {
    console.log(`Unlinked ${sourceId.slice(0, 8)} → ${targetId.slice(0, 8)} (${values.relation})`)
  } else {
    console.log('No matching link found.')
  }
  db.close()
}

function cmdContext(argv: string[]) {
  const { positionals, values } = parseArgs({
    args: argv,
    options: {
      depth: { type: 'string' },
      since: { type: 'string' },
      limit: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  })

  if (values.help) {
    console.log(`Usage: mustard context <id> [options]

Options:
  --depth <N>     Link traversal depth (1 or 2, default 1)
  --since <date>  Only include records updated since date
  --limit <N>     Max total records returned`)
    return
  }

  const id = positionals[0]
  if (!id) { console.error('Error: record ID is required'); process.exit(1) }

  const db = openDb()
  const result = getContext(db, {
    record_id: id,
    depth: values.depth ? parseInt(values.depth, 10) : undefined,
    since: values.since,
    limit: values.limit ? parseInt(values.limit, 10) : undefined,
  })

  if (result.anchors.length === 0) {
    console.log('Record not found.')
    db.close()
    process.exit(1)
  }

  for (const a of result.anchors) {
    console.log(formatRecord(a))
  }

  if (result.linked.length > 0) {
    console.log(`\nLinked records (${result.linked.length}):`)
    for (const l of result.linked) {
      console.log(formatLinkedRecord(l))
    }
  }
  db.close()
}

function cmdDaily(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      date: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })

  if (values.help) {
    console.log(`Usage: mustard daily [options]

Options:
  --date <YYYY-MM-DD>  Date for summary (default: today)`)
    return
  }

  const db = openDb()
  const result: DailySummaryResult = dailySummary(db, values.date)

  console.log(`Daily summary for ${result.date}\n`)

  if (result.overdue.length > 0) {
    console.log(`Overdue (${result.overdue.length}):`)
    for (const t of result.overdue) {
      console.log(`  ${t.id.slice(0, 8)}  due ${t.due_date}  ${t.title || t.text.slice(0, 60)}`)
    }
    console.log()
  }

  if (result.dueToday.length > 0) {
    console.log(`Due today (${result.dueToday.length}):`)
    for (const t of result.dueToday) {
      console.log(`  ${t.id.slice(0, 8)}  ${t.title || t.text.slice(0, 60)}`)
    }
    console.log()
  }

  if (result.openTodos.length > 0) {
    console.log(`Open todos (${result.openTodos.length}):`)
    for (const t of result.openTodos) {
      const due = t.due_date ? `  due ${t.due_date}` : ''
      console.log(`  ${t.id.slice(0, 8)}${due}  ${t.title || t.text.slice(0, 60)}`)
    }
    console.log()
  }

  if (result.todayLogs.length > 0) {
    console.log(`Today's logs (${result.todayLogs.length}):`)
    for (const l of result.todayLogs) {
      console.log(`  ${l.id.slice(0, 8)}  ${l.title || l.text.slice(0, 60)}`)
    }
    console.log()
  }

  if (result.recentNotes.length > 0) {
    console.log(`Recent notes (${result.recentNotes.length}):`)
    for (const n of result.recentNotes) {
      const person = n.person ? `  @${n.person}` : ''
      console.log(`  ${n.id.slice(0, 8)}  ${n.log_type}${person}  ${n.title || n.text.slice(0, 60)}`)
    }
  }

  if (result.overdue.length === 0 && result.dueToday.length === 0 && result.openTodos.length === 0 && result.todayLogs.length === 0 && result.recentNotes.length === 0) {
    console.log('Nothing to show.')
  }
  db.close()
}

function cmdProject(argv: string[]) {
  const { positionals, values } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  })

  if (values.help) {
    console.log('Usage: mustard project <id-or-title>')
    return
  }

  const target = positionals[0]
  if (!target) { console.error('Error: project ID or title is required'); process.exit(1) }

  const db = openDb()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(target)
  const result: ProjectSummaryResult | null = projectSummary(db, isUuid ? { record_id: target } : { title: target })

  if (!result) {
    console.error(`Error: project not found: ${target}`)
    db.close()
    process.exit(1)
  }

  console.log(formatRecord(result.project))

  if (result.team.length > 0) {
    console.log(`\nTeam (${result.team.length}):`)
    for (const m of result.team) { console.log(`  @${m.person || m.id.slice(0, 8)}`) }
  }

  if (result.openTodos.length > 0) {
    console.log(`\nOpen todos (${result.openTodos.length}):`)
    for (const t of result.openTodos) {
      console.log(`  ${t.id.slice(0, 8)}  ${t.title || t.text.slice(0, 60)}`)
    }
  }

  if (result.recentActivity.length > 0) {
    console.log(`\nRecent activity (${result.recentActivity.length}):`)
    for (const a of result.recentActivity) {
      console.log(`  ${a.id.slice(0, 8)}  ${a.log_type}  ${a.title || a.text.slice(0, 60)}`)
    }
  }

  if (result.linkedIdeas.length > 0) {
    console.log(`\nIdeas (${result.linkedIdeas.length}):`)
    for (const i of result.linkedIdeas) {
      console.log(`  ${i.id.slice(0, 8)}  ${i.title || i.text.slice(0, 60)}`)
    }
  }
  db.close()
}

// Main dispatcher
const subcommand = process.argv[2]
const subArgs = process.argv.slice(3)

if (!subcommand || subcommand === '--help' || subcommand === '-h') {
  console.log(USAGE)
  process.exit(0)
}

if (!SUBCOMMANDS.includes(subcommand)) {
  console.error(`Error: unknown command "${subcommand}"\n`)
  console.error(USAGE)
  process.exit(1)
}

try {
  switch (subcommand) {
    case 'create':  cmdCreate(subArgs); break
    case 'get':     cmdGet(subArgs); break
    case 'update':  cmdUpdate(subArgs); break
    case 'delete':  cmdDelete(subArgs); break
    case 'search':  cmdSearch(subArgs); break
    case 'list':    cmdList(subArgs); break
    case 'link':    cmdLink(subArgs); break
    case 'unlink':  cmdUnlink(subArgs); break
    case 'context': cmdContext(subArgs); break
    case 'daily':   cmdDaily(subArgs); break
    case 'project': cmdProject(subArgs); break
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`Error: ${message}`)
  process.exit(1)
}
