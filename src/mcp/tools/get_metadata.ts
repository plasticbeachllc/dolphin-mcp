import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { restGetChunk } from "../../rest/client.js";
import { logInfo, logError } from "../../util/logger.js";

/**
 * get_metadata tool analysis:
 * - Single request tool: fetches metadata for one chunk by chunk_id
 * - No parallelization needed: only makes one restGetChunk() call
 * - Performance is optimal: one request = one response
 * - No changes required for parallel snippet fetching implementation
 */

const INPUT_SHAPE = { chunk_id: z.string() };
const INPUT = z.object(INPUT_SHAPE);

export function makeGetMetadata(): {
  definition: Tool;
  handler: any;
  inputSchema: typeof INPUT_SHAPE;
} {
  const definition: Tool = {
    name: "get_metadata",
    description: "Return metadata for a chunk by chunk_id.",
    inputSchema: zodToJsonSchema(INPUT) as any,
    annotations: { title: "Chunk Metadata", readOnlyHint: true, idempotentHint: true },
  };

  const handler = async (args: any, signal?: AbortSignal): Promise<CallToolResult> => {
    const started = Date.now();
    try {
      const input = INPUT.parse(args?.input ?? args);
      const chunk = await restGetChunk(input.chunk_id, signal);
      // Drop content to keep response small
      const { content, ...meta } = chunk as any;
      await logInfo("get_metadata", "get_metadata success", { latency_ms: Date.now() - started });
      return { content: [{ type: "text", text: "Metadata ready." }], isError: false, data: meta };
    } catch (e: any) {
      const err = e?.error
        ? e
        : { error: { code: "unexpected_error", message: e?.message ?? String(e) } };
      await logError("get_metadata", "get_metadata error", {
        error_code: err.error.code,
        message: err.error.message,
      });
      const content: CallToolResult["content"] = [
        {
          type: "text",
          text: `${err.error.message} Remediation: verify chunk_id or re-run search.`,
        },
      ];
      return { content, isError: true, _meta: { upstream: err } };
    }
  };

  return { definition, handler, inputSchema: INPUT_SHAPE };
}
