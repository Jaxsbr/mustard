export const VALID_LOG_TYPES = ['todo', 'people_note', 'idea', 'daily_log', 'project', 'learning'] as const

export type LogType = (typeof VALID_LOG_TYPES)[number]

export const DEFAULT_STATUS: Record<string, string> = {
  todo: 'open',
  project: 'open',
  idea: 'captured',
  learning: 'captured',
  daily_log: 'logged',
  people_note: 'logged',
}

export interface RecordRow {
  id: string
  log_type: string
  title: string | null
  text: string
  capture_date: string
  person: string | null
  status: string
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

export interface LinkedRecord extends RecordRow {
  relation: string
}

export interface CreateParams {
  log_type: string
  text: string
  title?: string | null
  person?: string | null
  status?: string | null
  due_date?: string | null
  category?: string | null
  theme?: string | null
  period?: string | null
  tags?: string[]
  source_url?: string | null
  delegate?: string | null
}

export interface UpdateParams {
  id: string
  text?: string
  title?: string | null
  person?: string | null
  status?: string | null
  due_date?: string | null
  category?: string | null
  theme?: string | null
  period?: string | null
  tags?: string[]
  source_url?: string | null
  delegate?: string | null
}

export interface SearchParams {
  query: string
  type?: string
  person?: string
  status?: string
  limit?: number
}

export interface ListParams {
  type?: string
  person?: string
  status?: string
  delegate?: string | null
  sort?: 'newest' | 'oldest'
  limit?: number
}

export interface LinkParams {
  source_id: string
  target_id: string
  relation: string
}

export interface GetContextParams {
  record_id?: string
  person?: string
  project?: string
  since?: string
  depth?: number
  limit?: number
}

export interface ProjectSummaryParams {
  record_id?: string
  title?: string
  reference_date?: string
}
