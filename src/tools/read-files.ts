// mcp-bridge/src/tools/read-files.ts
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";

const readFilesSchema = z.object({
  paths: z.array(z.string()).min(1).max(50).describe("File paths to read"),
  max_size_bytes: z
    .number()
    .default(1048576)
    .describe("Max size per file (1MB default)"),
  fail_on_error: z.boolean().default(false).describe("Fail if any file fails"),
});

type ReadFileSuccess = {
  path: string;
  status: "success";
  content: string;
  size_bytes: number;
  line_count: number;
  last_modified: string;
};

type ReadFileError = {
  path: string;
  status: "error";
  error: string;
};

type ReadFileResult = ReadFileSuccess | ReadFileError;

export async function readFiles(input: z.infer<typeof readFilesSchema>) {
  const workspaceRoot = process.cwd();

  const settledResults = await Promise.allSettled(
    input.paths.map(async (filepath): Promise<ReadFileSuccess> => {
      const fullPath = path.resolve(workspaceRoot, filepath);

      // Security check
      if (!fullPath.startsWith(workspaceRoot)) {
        throw new Error("Access denied: outside workspace");
      }

      const stat = await fs.stat(fullPath);

      if (stat.size > input.max_size_bytes) {
        throw new Error(
          `File too large: ${stat.size} bytes > ${input.max_size_bytes} bytes`
        );
      }

      const content = await fs.readFile(fullPath, "utf-8");

      return {
        path: filepath,
        status: "success",
        content,
        size_bytes: stat.size,
        line_count: content.split("\n").length,
        last_modified: stat.mtime.toISOString(),
      };
    })
  );

  // Convert to single result array preserving order
  const results: ReadFileResult[] = settledResults.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        path: input.paths[index],
        status: "error",
        error: result.reason.message,
      };
    }
  });

  const successful = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  if (input.fail_on_error && failed > 0) {
    const errorPaths = results
      .filter((r) => r.status === "error")
      .map((r) => r.path)
      .join(", ");
    throw new Error(`Failed to read ${failed} file(s): ${errorPaths}`);
  }

  const totalBytes = results.reduce((sum, r) => {
    return r.status === "success" ? sum + r.size_bytes : sum;
  }, 0);

  return {
    results,
    summary: {
      total_requested: input.paths.length,
      successful,
      failed,
      total_bytes: totalBytes,
    },
  };
}

export const readFilesTool = {
  name: "read_files",
  description:
    "Read multiple files in batch with optional partial failure handling",
  inputSchema: readFilesSchema,
  handler: readFiles,
};