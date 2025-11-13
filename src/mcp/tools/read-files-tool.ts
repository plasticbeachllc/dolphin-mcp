// mcp-bridge/src/tools/read-files-tool.ts
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import * as fs from 'fs/promises'
import * as path from 'path'

const INPUT_SHAPE = {
  paths: z.array(z.string()).min(1).max(50).describe('File paths to read'),
  max_size_bytes: z
    .number()
    .default(1048576)
    .describe('Max size per file (1MB default)'),
  fail_on_error: z.boolean().default(false).describe('Fail if any file fails')
}

const INPUT = z.object(INPUT_SHAPE)

type _Input = z.infer<typeof INPUT>

type ReadFileSuccess = {
  path: string
  status: 'success'
  content: string
  size_bytes: number
  line_count: number
  last_modified: string
}

type ReadFileError = {
  path: string
  status: 'error'
  error: string
}

type ReadFileResult = ReadFileSuccess | ReadFileError

export function makeReadFiles(): { definition: Tool; handler: any; inputSchema: typeof INPUT_SHAPE } {
  const definition: Tool = {
    name: 'read_files',
    description: 'Read multiple files in batch with optional partial failure handling',
    inputSchema: zodToJsonSchema(INPUT) as any,
    annotations: {
      title: 'Read Files',
      readOnlyHint: true,
      openWorldHint: false
    }
  }

  const handler = async (args: any, _signal?: AbortSignal): Promise<CallToolResult> => {
    try {
      const input = INPUT.parse(args?.input ?? args)
      const workspaceRoot = process.cwd()

      const settledResults = await Promise.allSettled(
        input.paths.map(async (filepath): Promise<ReadFileSuccess> => {
          // Always resolve path relative to workspace (handles both relative and absolute)
          const fullPath = path.resolve(workspaceRoot, filepath)

          // Security check: ensure resolved path is within workspace boundary
          // This prevents directory traversal and blocks absolute paths outside workspace
          if (!fullPath.startsWith(workspaceRoot)) {
            throw new Error('Access denied: path outside workspace')
          }

          const stat = await fs.stat(fullPath)

          if (stat.size > input.max_size_bytes) {
            throw new Error(
              `File too large: ${stat.size} bytes > ${input.max_size_bytes} bytes`
            )
          }

          const content = await fs.readFile(fullPath, 'utf-8')

          return {
            path: filepath,
            status: 'success',
            content,
            size_bytes: stat.size,
            line_count: content.split('\n').length,
            last_modified: stat.mtime.toISOString()
          }
        })
      )

      // Convert to single result array preserving order
      const results: ReadFileResult[] = settledResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value
        } else {
          return {
            path: input.paths[index],
            status: 'error',
            error: result.reason.message
          }
        }
      })

      const successful = results.filter((r) => r.status === 'success').length
      const failed = results.filter((r) => r.status === 'error').length

      if (input.fail_on_error && failed > 0) {
        const errorPaths = results
          .filter((r) => r.status === 'error')
          .map((r) => r.path)
          .join(', ')
        throw new Error(`Failed to read ${failed} file(s): ${errorPaths}`)
      }

      const totalBytes = results.reduce((sum, r) => {
        return r.status === 'success' ? sum + r.size_bytes : sum
      }, 0)

      const response = {
        results,
        summary: {
          total_requested: input.paths.length,
          successful,
          failed,
          total_bytes: totalBytes
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        isError: false
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Read files failed: ${error.message}` }],
        isError: true
      }
    }
  }

  return { definition, handler, inputSchema: INPUT_SHAPE }
}