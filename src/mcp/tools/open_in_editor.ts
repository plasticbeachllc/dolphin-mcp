import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { restListRepos, type RepoInfo } from "../../rest/client.js";
import { logInfo, logError } from "../../util/logger.js";

const INPUT_SHAPE = {
  repo: z.string(),
  path: z.string(),
  line: z.number().int().min(1).optional(),
  column: z.number().int().min(1).optional(),
};

const INPUT = z.object(INPUT_SHAPE);

type CacheEntry = { ts: number; repos: RepoInfo[] };
let cache: CacheEntry | null = null;
const TTL_MS = 5 * 60 * 1000;

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.ts > TTL_MS;
}

export function makeOpenInEditor(): {
  definition: Tool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: any;
  inputSchema: typeof INPUT_SHAPE;
} {
  const definition: Tool = {
    name: "open_in_editor",
    description: "Compute a vscode://file URI for a repo path and optional position.",
    inputSchema: zodToJsonSchema(INPUT) as Tool["inputSchema"],
    annotations: { title: "Open in VS Code", readOnlyHint: false },
  };

  const handler = async (args: unknown, signal?: AbortSignal): Promise<CallToolResult> => {
    const started = Date.now();
    try {
      const argsObj = args as { input?: unknown } | undefined;
      const input = INPUT.parse(argsObj?.input ?? args);
      const repoName = input.repo.trim();

      if (!cache || isExpired(cache)) {
        const list = await restListRepos(signal);
        cache = { ts: Date.now(), repos: list.repos };
      }

      const repo = cache.repos.find((r) => r.name === repoName);
      if (!repo)
        throw { error: { code: "repo_not_found", message: `Repository '${repoName}' not found` } };

      // Form encoded absolute path by combining repo root with file path
      const absPath = `${repo.path}/${input.path}`.replace(/\/\//g, "/");
      const encodedPath = encodeURI(absPath);

      const line = input.line;
      const column = input.column ?? (line != null ? 1 : undefined);
      const suffix = line != null ? `:${line}${column != null ? `:${column}` : ""}` : "";
      const uri = `vscode://file/${encodedPath}${suffix}`;

      await logInfo("open_in_editor", "open_in_editor success", {
        latency_ms: Date.now() - started,
      });
      return { content: [{ type: "text", text: uri }], isError: false, data: { uri } };
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      const err = (e as { error?: { code: string; message: string } })?.error
        ? (e as { error: { code: string; message: string } })
        : { error: { code: "unexpected_error", message: error.message } };
      await logError("open_in_editor", "open_in_editor error", {
        error_code: err.error.code,
        message: err.error.message,
      });
      const content: CallToolResult["content"] = [
        {
          type: "text",
          text: `${err.error.message} Remediation: call /v1/repos and use an exact repo name.`,
        },
      ];
      return { content, isError: true, _meta: { upstream: err } };
    }
  };

  return { definition, handler, inputSchema: INPUT_SHAPE };
}
