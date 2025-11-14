import { mkdir, appendFile, stat, rename, access } from "node:fs/promises";
import { constants as FS_CONST } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, "../../logs");
const LOG_FILE = join(LOG_DIR, "mcp.log");

// Simple size-based rotation
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROTATIONS = 3;

type Level = "debug" | "info" | "warn" | "error";

interface LogLine {
  ts: string;
  level: Level;
  event: string;
  context?: Record<string, unknown>;
  message: string;
  meta?: Record<string, unknown>;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, FS_CONST.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function rotateIfNeeded(): Promise<void> {
  try {
    const s = await stat(LOG_FILE);
    if (s.size < MAX_LOG_BYTES) return;
  } catch {
    // no file yet; nothing to rotate
    return;
  }

  // Rotate: mcp.log.(MAX_ROTATIONS-1) -> .MAX_ROTATIONS, ..., mcp.log.1 -> .2, mcp.log -> .1
  for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
    const src = `${LOG_FILE}.${i}`;
    const dst = `${LOG_FILE}.${i + 1}`;
    if (await exists(src)) {
      try {
        await rename(src, dst);
      } catch {
        /* ignore */
      }
    }
  }
  // Base file to .1
  try {
    if (await exists(LOG_FILE)) {
      await rename(LOG_FILE, `${LOG_FILE}.1`);
    }
  } catch {
    // ignore
  }
}

async function writeLine(line: LogLine): Promise<void> {
  await rotateIfNeeded();
  const payload = JSON.stringify(line) + "\n";
  await appendFile(LOG_FILE, payload, { encoding: "utf8" });
}

export async function initLogger(): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });
}

function baseLine(
  level: Level,
  event: string,
  message: string,
  meta?: Record<string, unknown>,
  context?: Record<string, unknown>
): LogLine {
  return {
    ts: new Date().toISOString(),
    level,
    event,
    message,
    context,
    meta,
  };
}

export async function logInfo(
  event: string,
  message: string,
  meta?: Record<string, unknown>,
  context?: Record<string, unknown>
): Promise<void> {
  await writeLine(baseLine("info", event, message, meta, context));
}

export async function logWarn(
  event: string,
  message: string,
  meta?: Record<string, unknown>,
  context?: Record<string, unknown>
): Promise<void> {
  await writeLine(baseLine("warn", event, message, meta, context));
}

export async function logError(
  event: string,
  message: string,
  meta?: Record<string, unknown>,
  context?: Record<string, unknown>
): Promise<void> {
  await writeLine(baseLine("error", event, message, meta, context));
}
