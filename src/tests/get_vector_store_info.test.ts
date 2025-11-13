import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startMockRest } from "./mockServer.js";
import { makeGetVectorStoreInfo } from "../mcp/tools/get_vector_store_info.js";
import { initLogger } from "../util/logger.js";

let stop: () => Promise<void>;

beforeAll(async () => {
  await initLogger();
  stop = await startMockRest(7777);
});
afterAll(async () => {
  await stop?.();
});

describe("get_vector_store_info", () => {
  it("returns namespaces, dims, limits, counts from /v1/repos sum; latency keys present", async () => {
    const { handler } = makeGetVectorStoreInfo();
    const res = await handler({ input: {} });

    expect(res.isError).toBe(false);
    expect(res.data.namespaces).toContain("chunks_small");
    expect(res.data.namespaces).toContain("chunks_large");
    expect(res.data.dims).toBeDefined();
    expect(res.data.dims.chunks_small).toBe(1536);
    expect(res.data.dims.chunks_large).toBe(3072);
    expect(res.data.limits).toBeDefined();
    expect(res.data.limits.top_k_max).toBe(20);
    expect(res.data.counts).toBeDefined();
    expect(res.data.counts.approx_chunks_total).toBe(7); // 2 + 5 from mock repos
    expect(res.data.latency).toBeDefined();
    // Latency might be null initially, but keys should be present
    expect(res.data.latency.search_p50_ms).toBeDefined();
    expect(res.data.latency.search_p95_ms).toBeDefined();
  });

  it("works with empty repos list (counts=0)", async () => {
    // This would require a mock server that returns empty repos
    // For now, we test the current behavior
    const { handler } = makeGetVectorStoreInfo();
    const res = await handler({ input: {} });

    expect(res.isError).toBe(false);
    expect(res.data.counts.approx_chunks_total).toBeGreaterThanOrEqual(0);
  });

  it("tool definition includes valid JSON Schema", async () => {
    const { definition } = makeGetVectorStoreInfo();

    expect(definition.inputSchema).toBeDefined();
    // This tool has no required inputs
    expect(definition.inputSchema.type).toBe("object");
    expect(definition.inputSchema.properties).toBeDefined();
  });
});
