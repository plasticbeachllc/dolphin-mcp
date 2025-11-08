// mcp-bridge/src/tools/file-write-tool.ts
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import * as fs from 'fs/promises'
import * as path from 'path'
import { randomBytes } from 'crypto'

const INPUT_SHAPE = {
  path: z.string().describe('File path relative to workspace'),
  content: z.string().describe('Content to write'),
  create_backup: z
    .boolean()
    .default(true)
    .describe('Create backup before overwriting'),
  create_directories: z
    .boolean()
    .default(true)
    .describe('Create parent directories')
}

const INPUT = z.object(INPUT_SHAPE)

type Input = z.infer<typeof INPUT>

export function makeFileWrite(): { definition: Tool; handler: any; inputSchema: typeof INPUT_SHAPE } {
  const definition: Tool = {
    name: 'file_write',
    description: 'Write content to a file with atomic operation and optional backup',
    inputSchema: zodToJsonSchema(INPUT) as any,
    annotations: {
      title: 'Write File',
      readOnlyHint: false,
      openWorldHint: false
    }
  }

  const handler = async (args: any, signal?: AbortSignal): Promise<CallToolResult> => {
    try {
      const input = INPUT.parse(args?.input ?? args)
      const workspaceRoot = process.cwd()
      const fullPath = path.resolve(workspaceRoot, input.path)

      // Security: Workspace boundary check
      if (!fullPath.startsWith(workspaceRoot)) {
        throw new Error(`Access denied: ${input.path} is outside workspace`)
      }

      let backupPath: string | undefined
      let createdNew = false

      try {
        // Check if file exists
        await fs.access(fullPath)

        // Create backup
        if (input.create_backup) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          backupPath = `${fullPath}.backup-${timestamp}`
          await fs.copyFile(fullPath, backupPath)
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          createdNew = true

          // Create directories
          if (input.create_directories) {
            await fs.mkdir(path.dirname(fullPath), { recursive: true })
          }
        } else {
          throw error
        }
      }

      // Atomic write: temp file + rename
      const tempPath = `${fullPath}.tmp-${randomBytes(6).toString('hex')}`

      try {
        await fs.writeFile(tempPath, input.content, 'utf-8')
        await fs.rename(tempPath, fullPath) // Atomic on POSIX
      } catch (error) {
        // Clean up temp file
        await fs.unlink(tempPath).catch(() => {})
        throw error
      }

      const stat = await fs.stat(fullPath)

      const result = {
        path: input.path,
        bytes_written: stat.size,
        backup_path: backupPath,
        created_new: createdNew,
        timestamp: new Date().toISOString()
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: false
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `File write failed: ${error.message}` }],
        isError: true
      }
    }
  }

  return { definition, handler, inputSchema: INPUT_SHAPE }
}