#!/usr/bin/env bun
import { createServer } from "./mcp/server.js";

// Environment variable configuration
const DOLPHIN_API_URL =
  process.env.DOLPHIN_API_URL || process.env.KB_REST_BASE_URL || "http://127.0.0.1:7777";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const SERVER_NAME = process.env.SERVER_NAME || "dolphin-mcp";
const SERVER_VERSION = process.env.SERVER_VERSION || "1.0.0";

// Validate critical configuration
if (!DOLPHIN_API_URL || DOLPHIN_API_URL.trim() === "") {
  console.error("❌ Error: DOLPHIN_API_URL or KB_REST_BASE_URL environment variable is required");
  console.error("   Example: DOLPHIN_API_URL=http://127.0.0.1:7777");
  process.exit(1);
}

// Validate URL format
try {
  new URL(DOLPHIN_API_URL);
} catch {
  console.error("❌ Error: Invalid DOLPHIN_API_URL format");
  console.error(`   Current value: ${DOLPHIN_API_URL}`);
  console.error("   Expected format: http://127.0.0.1:7777 or https://api.example.com");
  process.exit(1);
}

// Set process environment for the server
process.env.DOLPHIN_API_URL = DOLPHIN_API_URL;
process.env.LOG_LEVEL = LOG_LEVEL;
process.env.SERVER_NAME = SERVER_NAME;
process.env.SERVER_VERSION = SERVER_VERSION;

// Start the server
try {
  await createServer();
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("❌ Failed to start Dolphin MCP server:", errorMessage);
  process.exit(1);
}
