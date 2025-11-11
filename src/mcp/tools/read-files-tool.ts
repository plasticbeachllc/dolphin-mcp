import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import * as fs from 'fs/promises'
import * as path from 'path'

const DEFAULT_MAX_SIZE_BYTES = 1024 * 1024 // 1MB per file
const MAX_PATHS = 20

const INPUT_SHAPE = {
  paths: z
    .array(z.string().min(1, 'Path must not be empty'))
    .min(1, 'Provide at least one path')
    .max(MAX_PATHS, `Request up to ${MAX_PATHS} files at a time`)
    .describe('Relative file paths to read from the workspace'),
  max_size_bytes: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_MAX_SIZE_BYTES)
    .describe('Maximum number of bytes to read from each file'),
  fail_on_error: z
    .boolean()
    .default(true)
    .describe('If true, fail the entire call when a file cannot be read')
}

const INPUT = z.object(INPUT_SHAPE)

type Input = z.infer<typeof INPUT>

type ReadResult =
  | ({
      status: 'success'
      path: string
      content: string
      size_bytes: number
      line_count: number
    } & Record<string, unknown>)
  | ({
      status: 'error'
      path: string
      error: string
    } & Record<string, unknown>)

function ensureWithinWorkspace(workspaceRoot: string, targetPath: string) {
  const normalizedWorkspace = path.normalize(workspaceRoot)
  const normalizedTarget = path.normalize(targetPath)
  const relative = path.relative(normalizedWorkspace, normalizedTarget)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Access denied: ${targetPath} resolves outside workspace`)
  }
}

export function makeReadFiles(): {
  definition: Tool
  handler: any
  inputSchema: typeof INPUT_SHAPE
} {
  const definition: Tool = {
    name: 'read_files',
    description:
      'Read the contents of multiple files from the current workspace with strict safety checks, size limits, and detailed summaries.',
    inputSchema: zodToJsonSchema(INPUT) as any,
    annotations: {
      title: 'Read Files (Batch)',
      readOnlyHint: true,
      openWorldHint: false
    }
  }

  const handler = async (args: any): Promise<CallToolResult> => {
    const input: Input = INPUT.parse(args?.input ?? args ?? {})
    const workspaceRoot = path.resolve(process.cwd())

    const results: ReadResult[] = []
    let successful = 0
    let failed = 0
    let totalBytes = 0

    for (const requestedPath of input.paths) {
      const trimmedPath = requestedPath.trim()

      try {
        if (!trimmedPath) {
          throw new Error('Path must not be empty')
        }

        const resolvedPath = path.resolve(workspaceRoot, trimmedPath)
        ensureWithinWorkspace(workspaceRoot, resolvedPath)

        const stat = await fs.stat(resolvedPath)
        if (!stat.isFile()) {
          throw new Error('Path is not a regular file')
        }

        if (stat.size > input.max_size_bytes) {
          throw new Error(
            `File exceeds max_size_bytes (${input.max_size_bytes}) with size ${stat.size}`
          )
        }

        const content = await fs.readFile(resolvedPath, 'utf-8')
        const lineCount = content === '' ? 0 : content.split(/\r?\n/).length

        const successResult: ReadResult = {
          status: 'success',
          path: requestedPath,
          content,
          size_bytes: stat.size,
          line_count: lineCount
        }

        results.push(successResult)
        successful += 1
        totalBytes += stat.size
      } catch (error: any) {
        const errorResult: ReadResult = {
          status: 'error',
          path: requestedPath,
          error: error?.message ?? String(error)
        }
        results.push(errorResult)
        failed += 1

        if (input.fail_on_error) {
          const summary = {
            total_requested: input.paths.length,
            successful,
            failed,
            total_bytes_read: totalBytes
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ results, summary }, null, 2)
              }
            ],
            isError: true
          }
        }
      }
    }

    const summary = {
      total_requested: input.paths.length,
      successful,
      failed,
      total_bytes_read: totalBytes
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ results, summary }, null, 2)
        }
      ],
      isError: failed > 0 && input.fail_on_error
    }
  }

  return { definition, handler, inputSchema: INPUT_SHAPE }
}
