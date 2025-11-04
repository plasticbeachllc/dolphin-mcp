import { restGetFileSlice } from '../../rest/client.js'
import { mapWithConcurrency, TaskResult } from '../../util/concurrency.js'
import { logWarn, logError, logInfo } from '../../util/logger.js'

/**
 * Request for fetching a snippet from a specific file location
 */
export interface SnippetFetchRequest {
  repo: string
  path: string
  startLine: number
  endLine: number
}

/**
 * Result of a snippet fetch operation
 */
export interface SnippetFetchResult {
  content: string
  warnings?: string[]
}

/**
 * Options for configuring parallel snippet fetching
 */
export interface SnippetFetchOptions {
  maxConcurrent?: number
  requestTimeoutMs?: number
  retryAttempts?: number
  signal?: AbortSignal
}

/**
 * Fetches snippets in parallel with concurrency control, timeout handling, and retry logic
 * 
 * This function uses the mapWithConcurrency utility to fetch multiple file snippets
 * simultaneously while respecting concurrency limits. It handles timeouts, retries,
 * and provides comprehensive error logging for monitoring and debugging.
 * 
 * @param requests - Array of snippet fetch requests
 * @param options - Configuration options for parallel fetching
 * @returns Promise resolving to indexed map of results (undefined for failed requests)
 * 
 * @example
 * ```typescript
 * const requests = [
 *   { repo: 'repo1', path: 'src/a.ts', startLine: 1, endLine: 10 },
 *   { repo: 'repo1', path: 'src/b.py', startLine: 5, endLine: 15 }
 * ]
 * 
 * const results = await fetchSnippetsInParallel(requests, {
 *   maxConcurrent: 4,
 *   requestTimeoutMs: 2000,
 *   retryAttempts: 1
 * })
 * ```
 */
export async function fetchSnippetsInParallel(
  requests: SnippetFetchRequest[],
  options: SnippetFetchOptions = {}
): Promise<{ [key: number]: SnippetFetchResult | undefined }> {
  const {
    maxConcurrent = 8,
    requestTimeoutMs = 2000,
    retryAttempts = 1,
    signal
  } = options

  const startTime = Date.now()
  await logInfo('snippet_fetch', 'Starting parallel snippet fetch', {
    count: requests.length,
    concurrency: maxConcurrent,
    timeout: requestTimeoutMs
  })

  const results = await mapWithConcurrency(
    requests,
    async (request, index) => {
      // Implement timeout and retry logic
      let lastError: Error | undefined

      for (let attempt = 0; attempt <= retryAttempts; attempt++) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs)

          // Use timeout controller signal, but check external signal status
          if (signal?.aborted) {
            clearTimeout(timeoutId)
            throw new DOMException('Aborted', 'AbortError')
          }

          const result = await restGetFileSlice(
            request.repo.trim(),
            request.path,
            request.startLine,
            request.endLine,
            controller.signal
          )

          clearTimeout(timeoutId)
          return result
        } catch (error) {
          lastError = error as Error

          // Don't retry for aborted signals
          if ((error as any)?.name === 'AbortError') {
            throw error
          }

          if (attempt < retryAttempts) {
            // Exponential backoff for retries
            const delay = Math.pow(2, attempt) * 100
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
      }

      throw lastError
    },
    {
      maxConcurrent,
      onProgress: (completed, total) => {
        if (total > 10) { // Only log for large batches
          logInfo('snippet_fetch', `Fetched ${completed}/${total} snippets`)
        }
      }
    }
  )

  // Transform results into indexed map, marking failures
  const snippetMap: { [key: number]: SnippetFetchResult | undefined } = {}
  let successful = 0
  let failed = 0

  results.forEach((result, index) => {
    if (result.success && result.data) {
      snippetMap[index] = {
        content: result.data.content,
        warnings: result.data._meta?.warnings
      }
      successful++
    } else {
      // Log error but don't fail the entire request
      const request = requests[index]
      const errorMessage = result.error?.message || 'Unknown error'
      
      logWarn('snippet_fetch', 'Failed to fetch snippet', {
        repo: request.repo,
        path: request.path,
        lines: `${request.startLine}-${request.endLine}`,
        error: errorMessage,
        attempt: result.error ? 'final' : 'timeout'
      })
      
      snippetMap[index] = {
        content: '', // Empty string preserves structure
        warnings: ['Failed to load snippet']
      }
      failed++
    }
  })

  await logInfo('snippet_fetch', 'Completed parallel snippet fetch', {
    count: requests.length,
    successful,
    failed,
    duration_ms: Date.now() - startTime
  })

  return snippetMap
}

/**
 * Utility function to convert search hits to snippet fetch requests
 * 
 * @param hits - Array of search hits
 * @returns Array of snippet fetch requests
 */
export function requestsFromHits(hits: Array<{ repo: string, path: string, start_line: number, end_line: number }>): SnippetFetchRequest[] {
  return hits.map(hit => ({
    repo: hit.repo,
    path: hit.path,
    startLine: hit.start_line,
    endLine: hit.end_line
  }))
}