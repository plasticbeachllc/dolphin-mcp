import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startMockRest } from "./mockServer.js";
import { makeFetchLines } from "../mcp/tools/fetch_lines.js";
import { initLogger } from "../util/logger.js";

let stop: () => Promise<void>;

beforeAll(async () => {
  await initLogger();
  stop = await startMockRest(7777);
});
afterAll(async () => {
  await stop?.();
});

describe("fetch_lines", () => {
  it("happy path: returns file slice with inclusive end-line semantics, citation and resource text", async () => {
    const { handler } = makeFetchLines();
    const res = await handler({ input: { repo: "repoa", path: "src/a.ts", start: 1, end: 10 } });

    expect(res.isError).toBe(false);
    expect(res.data.start_line).toBe(1);
    expect(res.data.end_line).toBe(10);
    expect(res.data.content).toBeDefined();

    // Check content structure
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content.length).toBeGreaterThan(0);
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text).toContain("repoa/src/a.ts");
    expect(res.content[0].text).toContain("L1-L10");

    // Check resource block exists with code content
    const resourceBlock = res.content.find((c) => c.type === "resource");
    expect(resourceBlock).toBeDefined();
    expect(resourceBlock?.resource?.uri).toContain("kb://");
    expect(resourceBlock?.resource?.text).toBeDefined();
  });

  it("MIME type derived from language/path", async () => {
    const { handler } = makeFetchLines();
    const res = await handler({ input: { repo: "repoa", path: "src/a.ts", start: 1, end: 10 } });

    expect(res.isError).toBe(false);
    // The resource block should have proper MIME type for TypeScript
    const resourceBlock = res.content.find((c) => c.type === "resource");
    expect(resourceBlock?.resource?.mimeType).toBe("text/x-typescript");
  });

  it("invalid_range → isError=true with remediation", async () => {
    const { handler } = makeFetchLines();
    const res = await handler({ input: { repo: "repoa", path: "src/a.ts", start: 10, end: 1 } });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/remediation/i);
    expect(res.content[0].text).toMatch(/range/i);
  });

  it("file_not_found → isError=true with remediation", async () => {
    const { handler } = makeFetchLines();
    const res = await handler({
      input: { repo: "repoa", path: "nonexistent.ts", start: 1, end: 10 },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/remediation/i);
    expect(res.content[0].text).toMatch(/file/i);
  });

  it("tool definition includes valid JSON Schema", async () => {
    const { definition } = makeFetchLines();

    expect(definition.inputSchema).toBeDefined();
    expect(definition.inputSchema.type).toBe("object");
    expect(definition.inputSchema.required).toContain("repo");
    expect(definition.inputSchema.required).toContain("path");
    expect(definition.inputSchema.required).toContain("start");
    expect(definition.inputSchema.required).toContain("end");
    expect(definition.inputSchema.properties).toBeDefined();
  });
});
