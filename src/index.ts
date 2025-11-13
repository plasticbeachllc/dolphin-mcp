import { createServer } from "./mcp/server.js";
import { initLogger, logError } from "./util/logger.js";

// Entry point for dev (bun run src/index.ts)
createServer().catch(async (err: any) => {
  try {
    await initLogger();
    await logError("server_start", "Failed to start MCP server", {
      message: err?.message ?? String(err),
      stack: err?.stack,
    });
  } catch {
    // ignore logging failures
  }
  // Avoid stdout so MCP clients don't misinterpret the output
  process.exitCode = 1;
});
