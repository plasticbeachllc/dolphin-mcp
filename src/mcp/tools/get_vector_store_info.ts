import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { restListRepos } from "../../rest/client.js";
import { logInfo, logError } from "../../util/logger.js";

export function makeGetVectorStoreInfo(): { definition: Tool; handler: any } {
  const definition: Tool = {
    name: "get_vector_store_info",
    description: "Report namespaces, dims, limits, and approximate counts.",
    inputSchema: { type: "object", properties: {} },
    annotations: { title: "Vector Store Info", readOnlyHint: true, idempotentHint: true },
  };

  const handler = async (_args: any, signal?: AbortSignal): Promise<CallToolResult> => {
    const started = Date.now();
    try {
      const repos = await restListRepos(signal);
      const totalChunks = repos.repos.reduce((sum, r) => sum + (r.chunks ?? 0), 0);

      const data = {
        namespaces: ["chunks_small", "chunks_large"],
        dims: { chunks_small: 1536, chunks_large: 3072 },
        limits: { top_k_max: 20, snippet_tokens_cap: 500 },
        counts: { approx_chunks_total: totalChunks },
        latency: { search_p50_ms: null as number | null, search_p95_ms: null as number | null },
      };

      await logInfo("get_vector_store_info", "get_vector_store_info success", {
        latency_ms: Date.now() - started,
      });
      return {
        content: [{ type: "text", text: "Vector store info ready." }],
        isError: false,
        data,
      };
    } catch (e: any) {
      const err = e?.error
        ? e
        : { error: { code: "unexpected_error", message: e?.message ?? String(e) } };
      await logError("get_vector_store_info", "get_vector_store_info error", {
        error_code: err.error.code,
        message: err.error.message,
      });
      const content: CallToolResult["content"] = [
        {
          type: "text",
          text: `${err.error.message} Remediation: ensure REST service is running on 127.0.0.1:7777.`,
        },
      ];
      return { content, isError: true, _meta: { upstream: err } };
    }
  };

  return { definition, handler };
}
