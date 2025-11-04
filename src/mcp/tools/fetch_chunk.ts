import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { restGetChunk } from '../../rest/client.js'
import { mimeFromLangOrPath } from '../../util/mime.js'
import { logInfo, logError } from '../../util/logger.js'

const INPUT_SHAPE = { chunk_id: z.string() }
const INPUT = z.object(INPUT_SHAPE)

export function makeFetchChunk (): { definition: Tool, handler: any, inputSchema: typeof INPUT_SHAPE } {
  const definition: Tool = {
    name: 'fetch_chunk',
    description: 'Fetch a chunk by chunk_id and return fenced code with citation.',
    inputSchema: zodToJsonSchema(INPUT) as any,
    annotations: { title: 'Fetch Chunk', readOnlyHint: true, idempotentHint: true }
  }

  const handler = async (args: any, signal?: AbortSignal): Promise<CallToolResult> => {
    const started = Date.now()
    try {
      const input = INPUT.parse(args?.input ?? args)
      const chunk = await restGetChunk(input.chunk_id, signal)
      const lang = chunk.lang
      const code = chunk.content
      const mime = mimeFromLangOrPath(lang, chunk.path)

      const content: CallToolResult['content'] = [
        { type: 'text', text: `Chunk ${chunk.chunk_id} — ${chunk.repo}/${chunk.path}#L${chunk.start_line}-L${chunk.end_line}` },
        { type: 'resource', resource: { uri: chunk.resource_link, mimeType: mime, text: code } }
      ]

      await logInfo('fetch_chunk', 'fetch_chunk success', { latency_ms: Date.now() - started })
      return { content, isError: false, data: chunk }
    } catch (e: any) {
      const err = e?.error ? e : { error: { code: 'unexpected_error', message: e?.message ?? String(e) } }
      await logError('fetch_chunk', 'fetch_chunk error', { error_code: err.error.code, message: err.error.message })
      const content: CallToolResult['content'] = [{ type: 'text', text: `${err.error.message} Remediation: verify chunk_id or re-run search.` }]
      return { content, isError: true, _meta: { upstream: err } }
    }
  }

  return { definition, handler, inputSchema: INPUT_SHAPE }
}
