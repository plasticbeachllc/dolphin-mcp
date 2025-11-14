import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { restGetFileSlice } from "../../rest/client.js";
import { mimeFromLangOrPath } from "../../util/mime.js";
import { logInfo, logError } from "../../util/logger.js";

/**
 * fetch_lines tool analysis:
 * - Single request tool: fetches one file slice by repo/path/line range
 * - No parallelization needed: only makes one restGetFileSlice() call
 * - Performance is optimal: one request = one response
 * - No changes required for parallel snippet fetching implementation
 */

const INPUT_SHAPE = {
  repo: z.string(),
  path: z.string(),
  start: z.number().int().min(1),
  end: z.number().int().min(1),
};

const INPUT = z.object(INPUT_SHAPE);

export function makeFetchLines(): {
  definition: Tool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: any;
  inputSchema: typeof INPUT_SHAPE;
} {
  const definition: Tool = {
    name: "fetch_lines",
    description:
      "Fetch a file slice [start, end] inclusive from disk and return fenced code with citation.",
    inputSchema: zodToJsonSchema(INPUT) as Tool["inputSchema"],
    annotations: { title: "Fetch File Lines", readOnlyHint: true, idempotentHint: true },
  };

  const handler = async (args: unknown, signal?: AbortSignal): Promise<CallToolResult> => {
    const started = Date.now();
    try {
      const argsObj = args as { input?: unknown } | undefined;
      const input = INPUT.parse(argsObj?.input ?? args);
      const res = await restGetFileSlice(
        input.repo.trim(),
        input.path,
        input.start,
        input.end,
        signal
      );
      const mime = mimeFromLangOrPath(res.lang, res.path);

      const content: CallToolResult["content"] = [
        { type: "text", text: `${res.repo}/${res.path}#L${res.start_line}-L${res.end_line}` },
        {
          type: "resource",
          resource: {
            uri: `kb://${res.repo}/${res.path}#L${res.start_line}-L${res.end_line}`,
            mimeType: mime,
            text: res.content,
          },
        },
      ];

      await logInfo("fetch_file", "fetch_lines success", { latency_ms: Date.now() - started });
      return { content, isError: false, data: res };
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      const err = (e as { error?: { code: string; message: string } })?.error
        ? (e as { error: { code: string; message: string } })
        : { error: { code: "unexpected_error", message: error.message } };
      await logError("fetch_file", "fetch_lines error", {
        error_code: err.error.code,
        message: err.error.message,
      });
      const content: CallToolResult["content"] = [
        {
          type: "text",
          text: `${err.error.message} Remediation: verify repo/path and line range.`,
        },
      ];
      return { content, isError: true, _meta: { upstream: err } };
    }
  };

  return { definition, handler, inputSchema: INPUT_SHAPE };
}
