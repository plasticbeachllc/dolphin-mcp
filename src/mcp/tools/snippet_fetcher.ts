import { restGetFileSlice } from "../../rest/client.js";
import { mapWithConcurrency } from "../../util/concurrency.js";
import { logWarn, logError, logInfo } from "../../util/logger.js";

/**
 * Request for fetching a snippet from a specific file location
 */
export interface SnippetFetchRequest {
  repo: string;
  path: string;
  startLine: number;
  endLine: number;
  contextLinesBefore?: number;
  contextLinesAfter?: number;
}

/**
 * Result of a snippet fetch operation
 */
export interface SnippetFetchResult {
  content: string;
  warnings?: string[];
  actualStartLine?: number; // Actual start line including context
  actualEndLine?: number; // Actual end line including context
  chunkStartLine?: number; // Original chunk start line
  chunkEndLine?: number; // Original chunk end line
}

/**
 * Options for configuring parallel snippet fetching
 */
export interface SnippetFetchOptions {
  maxConcurrent?: number;
  requestTimeoutMs?: number;
  retryAttempts?: number;
  signal?: AbortSignal;
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
    requestTimeoutMs = 1500,
    retryAttempts = 1,
    signal: _signal,
  } = options;

  const startTime = Date.now();
  await logInfo("snippet_fetch", "Starting parallel snippet fetch", {
    count: requests.length,
    concurrency: maxConcurrent,
    timeout: requestTimeoutMs,
  });

  const results = await mapWithConcurrency(
    requests,
    async (request, _index) => {
      // Implement timeout and retry logic
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= retryAttempts; attempt++) {
        try {
          // Create timeout-based abort controller
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

          try {
            // DEBUG: Log exact parameters being sent to /file endpoint
            await logInfo("snippet_fetch_debug", "Attempting to fetch snippet", {
              repo: request.repo.trim(),
              repo_raw: request.repo,
              repo_length: request.repo.length,
              repo_trimmed_length: request.repo.trim().length,
              path: request.path,
              startLine: request.startLine,
              endLine: request.endLine,
              attempt: attempt + 1,
            });

            // Calculate expanded line range if context is requested
            const contextBefore = request.contextLinesBefore || 0;
            const contextAfter = request.contextLinesAfter || 0;
            const fetchStartLine = Math.max(1, request.startLine - contextBefore);
            const fetchEndLine = request.endLine + contextAfter;

            const result = await restGetFileSlice(
              request.repo.trim(),
              request.path,
              fetchStartLine,
              fetchEndLine,
              controller.signal
            );

            // Store metadata separately (don't mutate the API response)
            const metadata = {
              actualStartLine: fetchStartLine,
              actualEndLine: fetchEndLine,
              chunkStartLine: request.startLine,
              chunkEndLine: request.endLine,
            };

            // DEBUG: Log successful fetch
            await logInfo("snippet_fetch_debug", "Successfully fetched snippet", {
              repo: request.repo.trim(),
              path: request.path,
              content_length: result.content?.length || 0,
            });

            clearTimeout(timeoutId);
            return { result, metadata };
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (error) {
          lastError = error as Error;

          // DEBUG: Log fetch errors
          const err = error instanceof Error ? error : new Error(String(error));
          await logError("snippet_fetch_debug", "Failed to fetch snippet", {
            repo: request.repo.trim(),
            path: request.path,
            error_name: err.name,
            error_message: err.message,
            attempt: attempt + 1,
            will_retry: attempt < retryAttempts,
          });

          // Don't retry for aborted signals
          if (err.name === "AbortError") {
            throw error;
          }

          if (attempt < retryAttempts) {
            // Exponential backoff for retries
            const delay = Math.pow(2, attempt) * 100;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError;
    },
    {
      maxConcurrent,
      onProgress: (completed, total) => {
        if (total > 10) {
          // Only log for large batches
          logInfo("snippet_fetch", `Fetched ${completed}/${total} snippets`);
        }
      },
    }
  );

  // Transform results into indexed map, marking failures
  const snippetMap: { [key: number]: SnippetFetchResult | undefined } = {};
  let successful = 0;
  let failed = 0;

  results.forEach((result, index) => {
    if (result.success && result.data) {
      snippetMap[index] = {
        content: result.data.result.content,
        warnings: result.data.result._meta?.warnings,
        actualStartLine: result.data.metadata.actualStartLine,
        actualEndLine: result.data.metadata.actualEndLine,
        chunkStartLine: result.data.metadata.chunkStartLine,
        chunkEndLine: result.data.metadata.chunkEndLine,
      };
      successful++;
    } else {
      // Log error but don't fail the entire request
      const request = requests[index];
      const errorMessage = result.error?.message || "Unknown error";

      logWarn("snippet_fetch", "Failed to fetch snippet", {
        repo: request.repo,
        path: request.path,
        lines: `${request.startLine}-${request.endLine}`,
        error: errorMessage,
        attempt: result.error ? "final" : "timeout",
      });

      snippetMap[index] = {
        content: "", // Empty string preserves structure
        warnings: ["Failed to load snippet"],
      };
      failed++;
    }
  });

  await logInfo("snippet_fetch", "Completed parallel snippet fetch", {
    count: requests.length,
    successful,
    failed,
    duration_ms: Date.now() - startTime,
  });

  return snippetMap;
}

/**
 * Utility function to convert search hits to snippet fetch requests
 *
 * @param hits - Array of search hits
 * @returns Array of snippet fetch requests
 */
export function requestsFromHits(
  hits: Array<{ repo: string; path: string; start_line: number; end_line: number }>
): SnippetFetchRequest[] {
  return hits.map((hit) => ({
    repo: hit.repo,
    path: hit.path,
    startLine: hit.start_line,
    endLine: hit.end_line,
  }));
}
