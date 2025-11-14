import { createServer } from "./mcp/server.js";
import { initLogger, logError } from "./util/logger.js";

// Entry point for dev (bun run src/index.ts)
createServer().catch(async (err: unknown) => {
  try {
    await initLogger();
    const error = err instanceof Error ? err : new Error(String(err));
    await logError("server_start", "Failed to start MCP server", {
      message: error.message,
      stack: error.stack,
    });
  } catch {
    // ignore logging failures
  }
  // Avoid stdout so MCP clients don't misinterpret the output
  process.exitCode = 1;
});
