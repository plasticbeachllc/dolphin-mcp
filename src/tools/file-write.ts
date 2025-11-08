// mcp-bridge/src/tools/file-write.ts
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { randomBytes } from "crypto";

const fileWriteSchema = z.object({
  path: z.string().describe("File path relative to workspace"),
  content: z.string().describe("Content to write"),
  create_backup: z
    .boolean()
    .default(true)
    .describe("Create backup before overwriting"),
  create_directories: z
    .boolean()
    .default(true)
    .describe("Create parent directories"),
});

export async function fileWrite(input: z.infer<typeof fileWriteSchema>) {
  const workspaceRoot = process.cwd();
  const fullPath = path.resolve(workspaceRoot, input.path);

  // Security: Workspace boundary check
  if (!fullPath.startsWith(workspaceRoot)) {
    throw new Error(`Access denied: ${input.path} is outside workspace`);
  }

  let backupPath: string | undefined;
  let createdNew = false;

  try {
    // Check if file exists
    await fs.access(fullPath);

    // Create backup
    if (input.create_backup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupPath = `${fullPath}.backup-${timestamp}`;
      await fs.copyFile(fullPath, backupPath);
    }
  } catch (error: any) {
    if (error.code === "ENOENT") {
      createdNew = true;

      // Create directories
      if (input.create_directories) {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
      }
    } else {
      throw error;
    }
  }

  // Atomic write: temp file + rename
  const tempPath = `${fullPath}.tmp-${randomBytes(6).toString("hex")}`;

  try {
    await fs.writeFile(tempPath, input.content, "utf-8");
    await fs.rename(tempPath, fullPath); // Atomic on POSIX
  } catch (error) {
    // Clean up temp file
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }

  const stat = await fs.stat(fullPath);

  return {
    path: input.path,
    bytes_written: stat.size,
    backup_path: backupPath,
    created_new: createdNew,
    timestamp: new Date().toISOString(),
  };
}

export const fileWriteTool = {
  name: "file_write",
  description:
    "Write content to a file with atomic operation and optional backup",
  inputSchema: fileWriteSchema,
  handler: fileWrite,
};