import type { Tool, CallToolResult, EmbeddedResource, TextContent } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { restSearch, type SearchResponse } from '../../rest/client.js'
import { fetchSnippetsInParallel, type SnippetFetchRequest } from './snippet_fetcher.js'
import { CONFIG } from '../../util/config.js'
import { mimeFromLangOrPath } from '../../util/mime.js'
import { jsonSizeBytes } from '../../util/payloadCap.js'
import { logInfo, logWarn, logError } from '../../util/logger.js'

// Interface for the actual API response
interface ApiSearchHit {
  chunk_id: string
  repo: string
  path: string
  start_line: number
  end_line: number
  language?: string
  symbol_kind?: string | null
  symbol_name?: string | null
  symbol_path?: string | null
  score: number
  commit?: string
  branch?: string
}

interface ApiSearchResponse {
  hits: ApiSearchHit[]
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
}

const INPUT_SHAPE = {
  query: z.string().min(1),
  repos: z.array(z.string()).optional(),
  path_prefix: z.array(z.string()).optional(),
  top_k: z.number().int().min(1).max(100).optional(),
  max_snippets: z.number().int().min(1).optional(),
  deadline_ms: z.number().int().min(50).optional(),
  embed_model: z.enum(['small', 'large']).optional().default('large'),
  score_cutoff: z.number().optional(),
  cursor: z.string().optional(),
  ann_strategy: z.enum(['speed', 'accuracy', 'adaptive', 'custom']).optional(),
  ann_nprobes: z.number().int().min(1).max(50).optional(),
  ann_refine_factor: z.number().int().min(1).max(100).optional()
}

const INPUT = z.object(INPUT_SHAPE)

type Input = z.infer<typeof INPUT>

const CAP_BYTES = 50 * 1024
const PER_SNIPPET_CHAR_CAP = 500
const SHRUNK_SNIPPET_CHAR_CAP = 300
const MIN_SNIPPET_CHAR_FLOOR = 200

import { fenceLang } from '../../util/language.js'

function buildPromptReady (res: SearchResponse): string {
  const parts: string[] = []
  for (const h of res.hits) {
    parts.push(`[${h.repo}] ${h.path}#L${h.start_line}-L${h.end_line}`)
    const lang = fenceLang(h.lang, h.path)
    const code = h.snippet ?? ''
    if (lang) {
      parts.push('```' + lang)
      parts.push(code)
      parts.push('```')
    } else {
      parts.push('```')
      parts.push(code)
      parts.push('```')
    }
  }
  return parts.join('\n') + (parts.length ? '\n' : '')
}

export function makeSearchKnowledge (): { definition: Tool, handler: any, inputSchema: typeof INPUT_SHAPE } {
  const definition: Tool = {
    name: 'search_knowledge',
    description: 'Semantically query code and docs across indexed repositories and return ranked snippets with citations.',
    inputSchema: zodToJsonSchema(INPUT) as any,
    annotations: {
      title: 'Search Knowledge Base',
      readOnlyHint: true,
      openWorldHint: false
    }
  }

  const handler = async (args: any, signal?: AbortSignal): Promise<CallToolResult> => {
    const started = Date.now()
    try {
      const input = INPUT.parse(args?.input ?? args)

      // Trim repo names only
      const repos = input.repos?.map(r => r.trim())

      const body = {
        query: input.query,
        repos,
        path_prefix: input.path_prefix,
        top_k: input.top_k,
        max_snippets: input.max_snippets,
        deadline_ms: input.deadline_ms,
        embed_model: input.embed_model,
        score_cutoff: input.score_cutoff,
        cursor: input.cursor,
        include_prompt_ready: false,
        ann_strategy: input.ann_strategy,
        ann_nprobes: input.ann_nprobes,
        ann_refine_factor: input.ann_refine_factor
      }

      const res: SearchResponse = await restSearch(body, signal)
      
      // Transform API response to match expected format using parallel snippet fetching
      const hits = res.hits as any[]
      
      // Log search completion and snippet fetch start
      await logInfo('snippet_fetch_start', 'search_knowledge: Starting parallel snippet fetch', {
        query: input.query,
        hits_count: hits.length,
        concurrency: CONFIG.MAX_CONCURRENT_SNIPPET_FETCH,
        timeout: CONFIG.SNIPPET_FETCH_TIMEOUT_MS,
        retry_attempts: CONFIG.SNIPPET_FETCH_RETRY_ATTEMPTS
      })
      
      // Prepare all snippet fetch requests
      const snippetRequests: SnippetFetchRequest[] = hits.map((hit: any) => ({
        repo: hit.repo.trim(),
        path: hit.path,
        startLine: hit.start_line,
        endLine: hit.end_line
      }))
      
      // Fetch all snippets in parallel with configuration-based settings
      const snippetResults = await fetchSnippetsInParallel(
        snippetRequests,
        {
          maxConcurrent: CONFIG.MAX_CONCURRENT_SNIPPET_FETCH,
          requestTimeoutMs: CONFIG.SNIPPET_FETCH_TIMEOUT_MS,
          retryAttempts: CONFIG.SNIPPET_FETCH_RETRY_ATTEMPTS,
          signal
        }
      )
      
      // Transform results with snippet content and metadata
      const transformedHits = hits.map((hit: any, index: number) => {
        const snippetResult = snippetResults[index]
        return {
          ...hit,
          lang: hit.language || hit.lang,
          snippet: snippetResult?.content ?? '',
          resource_link: `kb://${hit.repo}/${hit.path}#L${hit.start_line}-L${hit.end_line}`,
          _snippet_warnings: snippetResult?.warnings
        }
      })

      // Replace hits with transformed version
      const transformedRes = {
        ...res,
        hits: transformedHits
      }

      // Build summary
      const k = transformedRes.hits.length
      const reposSet = new Set(transformedRes.hits.map(h => h.repo))
      const rcount = reposSet.size
      const est = transformedRes.meta.estimated_total
      const more = transformedRes.meta.complete === false && transformedRes.meta.cursor
      const summaryParts = [
        `Found ${k} result${k === 1 ? '' : 's'}${rcount > 0 ? ` across ${rcount} repo${rcount === 1 ? '' : 's'}` : ''}.`
      ]
      if (typeof est === 'number') summaryParts.push(`~${est} estimated results.`)
      if (more) summaryParts.push('More available — call search_knowledge again with cursor.')
      const summary = summaryParts.join(' ')

      // Build prompt-ready text
      let promptReady = buildPromptReady(transformedRes)

      // Build content blocks: one text summary + prompt-ready + resource blocks for each hit
      const content: CallToolResult['content'] = []
      content.push({ type: 'text', text: summary } as TextContent)
      if (promptReady.length > 0) {
        content.push({ type: 'text', text: promptReady } as TextContent)
      }

      for (const hit of transformedRes.hits) {
        const includeText = (hit.snippet ?? '').length <= PER_SNIPPET_CHAR_CAP
        const resourceBlock = {
          type: 'resource' as const,
          resource: {
            uri: hit.resource_link,
            mimeType: mimeFromLangOrPath(hit.lang, hit.path),
            // MCP SDK requires either text or blob to be present in the resource union.
            // Always provide a string (possibly empty) to satisfy schema under tight caps.
            text: includeText ? (hit.snippet ?? '') : ''
          }
        }
        content.push(resourceBlock)
      }

      // _meta compact hits list
      const metaHits = transformedRes.hits.map(h => ({
        chunk_id: h.chunk_id,
        repo: h.repo,
        path: h.path,
        start_line: h.start_line,
        end_line: h.end_line,
        score: h.score
      }))

      const result: CallToolResult = {
        content,
        isError: false,
        _meta: {
          hits: metaHits,
          cursor: transformedRes.meta.cursor,
          estimated_total: transformedRes.meta.estimated_total,
          complete: transformedRes.meta.complete,
          warnings: transformedRes.meta.warnings,
          model: transformedRes.meta.model,
          top_k: transformedRes.meta.top_k,
          mcp_latency_ms: Date.now() - started
        }
      }

      // Enforce ~50KB total cap by trimming in specified order
      let size = jsonSizeBytes(result)

      // Step 1: Trim prompt_ready text to fit budget
      if (size > CAP_BYTES) {
        const prIndex = content.length > 1 && (content[1] as any)?.type === 'text' ? 1 : -1
        if (prIndex === 1) {
          let prText: string = (content[1] as TextContent).text
          // Iteratively trim promptReady by 10% until under cap or floor
          while (prText.length > 0 && size > CAP_BYTES) {
            const cut = Math.max(Math.floor(prText.length * 0.9), 0)
            prText = prText.slice(0, cut)
            ;(content[1] as TextContent).text = prText
            size = jsonSizeBytes(result)
          }
        }
      }

      // Step 2: Shrink per-snippet windows (reduce text length) toward a floor
      if (size > CAP_BYTES) {
        // First pass: cap each resource text to SHRUNK_SNIPPET_CHAR_CAP
        for (let i = 0; i < content.length && size > CAP_BYTES; i++) {
          const block = content[i]
          if (block.type === 'resource' && (block as any).resource?.text) {
            const txt: string = (block as any).resource.text
            if (txt.length > SHRUNK_SNIPPET_CHAR_CAP) {
              (block as any).resource.text = txt.slice(0, SHRUNK_SNIPPET_CHAR_CAP)
              size = jsonSizeBytes(result)
            }
          }
        }
        // Second pass: cap further to MIN_SNIPPET_CHAR_FLOOR if still too big
        for (let i = 0; i < content.length && size > CAP_BYTES; i++) {
          const block = content[i]
          if (block.type === 'resource' && (block as any).resource?.text) {
            const txt: string = (block as any).resource.text
            if (txt.length > MIN_SNIPPET_CHAR_FLOOR) {
              (block as any).resource.text = txt.slice(0, MIN_SNIPPET_CHAR_FLOOR)
              size = jsonSizeBytes(result)
            }
          }
        }
      }

      // Step 3: Minimize snippet text from lowest-scoring hits first (keep citations present)
      if (size > CAP_BYTES) {
        for (let i = transformedRes.hits.length - 1; i >= 0 && size > CAP_BYTES; i--) {
          const blockIdx = i + 2 // +2 to skip summary and promptReady
          const block = result.content[blockIdx]
          if (block?.type === 'resource' && typeof (block as any).resource?.text === 'string') {
            // Replace with empty string to satisfy SDK schema while trimming payload
            ;(block as any).resource.text = ''
            size = jsonSizeBytes(result)
          }
        }
      }

      // Step 4: Drop lowest-scoring citations entirely
      if (size > CAP_BYTES) {
        while (result.content.length > 1 && size > CAP_BYTES) {
          // Keep summary at index 0; attempt to keep promptReady at index 1 if present
          const dropIndex = result.content.length - 1
          // pop content and its meta hit
          result.content.pop()
          metaHits.pop()
          size = jsonSizeBytes(result)
        }
        // Mark as partial page when trimming occurred
        result._meta = { ...result._meta, complete: false }
        await logWarn('search', 'trimmed content to respect 50KB cap', { trimmed: true })
      }

      // Calculate snippet fetch specific metrics
      const snippet_warnings_count = transformedRes.hits.filter(h => h._snippet_warnings && h._snippet_warnings.length > 0).length
      
      await logInfo('snippet_fetch_complete', 'search_knowledge: Completed parallel snippet fetch', {
        query: input.query,
        hits_count: transformedRes.hits.length,
        successful_snippets: transformedRes.hits.length - snippet_warnings_count,
        failed_snippets: snippet_warnings_count,
        snippet_warnings_count,
        latency_ms: transformedRes.meta.latency_ms,
        mcp_latency_ms: Date.now() - started,
        parallel_snippet_fetch: true,
        snippet_fetch_config: {
          max_concurrent: CONFIG.MAX_CONCURRENT_SNIPPET_FETCH,
          timeout_ms: CONFIG.SNIPPET_FETCH_TIMEOUT_MS,
          retry_attempts: CONFIG.SNIPPET_FETCH_RETRY_ATTEMPTS
        }
      })
      
      await logInfo('search', 'search_knowledge success', {
        hits_count: transformedRes.hits.length,
        warnings: transformedRes.meta.warnings,
        latency_ms: transformedRes.meta.latency_ms,
        mcp_latency_ms: Date.now() - started,
        parallel_snippet_fetch: true,
        snippet_warnings_count
      })

      return result
    } catch (e: any) {
      const err = e?.error ? e : { error: { code: 'unexpected_error', message: e?.message ?? String(e) } }
      await logError('search', 'search_knowledge error', { error_code: err.error.code, message: err.error.message })
      const remediation =
        err.error?.remediation ??
        (err.error?.code === 'invalid_json'
          ? 'Upstream returned non-JSON (e.g., "Internal Server Error"). Inspect server logs, verify endpoints and filters, or increase deadline_ms/top_k.'
          : 'Check repo names with /repos, adjust filters, or increase deadline_ms/top_k.')
      const message = `${err.error.message}${remediation ? ' Remediation: ' + remediation : ''}`
      const content: CallToolResult['content'] = [{ type: 'text', text: message }]
      return { content, isError: true, _meta: { upstream: err } }
    }
  }

  return { definition, handler, inputSchema: INPUT_SHAPE }
}
