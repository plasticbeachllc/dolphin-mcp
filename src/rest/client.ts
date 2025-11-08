import { CONFIG } from '../util/config.js'

export interface RestError {
  error: {
    code: string
    message: string
    details?: any
    remediation?: string
  }
}

export interface SearchRequestBody {
  query: string
  repos?: string[]
  path_prefix?: string[]
  top_k?: number
  max_snippets?: number
  deadline_ms?: number
  embed_model?: 'small' | 'large'
  score_cutoff?: number
  mmr_enabled?: boolean
  mmr_lambda?: number
  cursor?: string
  include_prompt_ready?: boolean
  ann_strategy?: 'speed' | 'accuracy' | 'adaptive' | 'custom'
  ann_nprobes?: number
  ann_refine_factor?: number
}

export interface SearchHit {
  repo: string
  path: string
  lang?: string
  symbol?: { kind?: string, name?: string, path?: string }
  start_line: number
  end_line: number
  score: number
  snippet: string
  snippet_fenced?: string
  chunk_id: string
  resource_link: string
}

export interface SearchResponse {
  hits: SearchHit[]
  meta: {
    top_k?: number
    model?: string
    latency_ms?: number
    timing?: { embedding_ms?: number, search_ms?: number, processing_ms?: number }
    cursor?: string
    estimated_total?: number
    complete?: boolean
    warnings?: string[]
  }
  prompt_ready?: string
}

export interface ChunkResponse {
  chunk_id: string
  repo: string
  path: string
  lang?: string
  symbol?: { kind?: string, name?: string, path?: string }
  start_line: number
  end_line: number
  content: string
  resource_link: string
}

export interface FileSliceResponse {
  repo: string
  path: string
  start_line: number
  end_line: number
  content: string
  lang?: string
  source: string
  symbol_context?: Array<{ kind?: string, name?: string, path?: string }>
  _meta?: { warnings?: string[] }
}

function getBaseUrl (): string {
  // Read env vars dynamically to support test mock server
  // Mock server sets KB_REST_BASE_URL after module load
  return process.env.KB_REST_BASE_URL || process.env.DOLPHIN_API_URL || CONFIG.DOLPHIN_API_URL
}

async function doFetch<T> (path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')
  headers.set('X-Client', 'mcp')

  const baseUrl = getBaseUrl()
  const res = await fetch(baseUrl + path, { ...init, headers, signal })
  const text = await res.text()

  // Be robust to non-JSON upstream responses (e.g., "Internal Server Error")
  let json: any = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch (parseErr: any) {
    const snippet = text?.slice(0, 200) ?? ''
    const rawMsg = parseErr?.message ?? String(parseErr)
    const normalizedMsg = typeof rawMsg === 'string' ? rawMsg.replace(/^JSON Parse error:\s*/i, '') : String(rawMsg)
    const err: RestError = {
      error: {
        code: 'invalid_json',
        message: `JSON parse error: ${normalizedMsg}`,
        remediation: 'Upstream returned non-JSON. Inspect server logs, verify endpoints and filters, or increase deadline_ms/top_k.',
        details: { status: res.status, statusText: res.statusText, body_snippet: snippet }
      }
    }
    throw err
  }

  if (!res.ok) {
    // Ensure a structured error even if upstream returned plain text
    if (!(json as any)?.error) {
      const err: RestError = {
        error: {
          code: 'upstream_error',
          message: `HTTP ${res.status} ${res.statusText}`,
          remediation: 'Check repo names with /repos, adjust filters, or increase deadline_ms/top_k. See server logs.',
          details: { body_snippet: (text || '').slice(0, 200) }
        }
      }
      throw err
    }
    throw json as RestError
  }

  return json as T
}

export async function restSearch (body: SearchRequestBody, signal?: AbortSignal): Promise<SearchResponse> {
  return await doFetch<SearchResponse>('/search', {
    method: 'POST',
    body: JSON.stringify(body)
  }, signal)
}

export async function restGetChunk (id: string, signal?: AbortSignal): Promise<ChunkResponse> {
  return await doFetch<ChunkResponse>(`/chunks/${encodeURIComponent(id)}`, { method: 'GET' }, signal)
}

export async function restGetFileSlice (repo: string, path: string, start: number, end: number, signal?: AbortSignal): Promise<FileSliceResponse> {
  const q = new URLSearchParams({ repo, path, start: String(start), end: String(end) })
  return await doFetch<FileSliceResponse>(`/file?${q.toString()}`, { method: 'GET' }, signal)
}

export interface RepoInfo { name: string, path: string, default_embed_model?: string, files?: number, chunks?: number }
export async function restListRepos (signal?: AbortSignal): Promise<{ repos: RepoInfo[] }> {
  return await doFetch<{ repos: RepoInfo[] }>('/repos', { method: 'GET' }, signal)
}
