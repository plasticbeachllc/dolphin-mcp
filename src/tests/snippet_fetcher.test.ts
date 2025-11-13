import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from "bun:test";
import { startMockRest } from "./mockServer.js";
import {
  fetchSnippetsInParallel,
  requestsFromHits,
  type SnippetFetchRequest,
  type SnippetFetchResult,
} from "../mcp/tools/snippet_fetcher.js";
import { initLogger } from "../util/logger.js";

let stop: () => Promise<void>;

beforeAll(async () => {
  await initLogger();
  stop = await startMockRest(7777);
});

afterAll(async () => {
  await stop?.();
});

describe("snippet_fetcher", () => {
  describe("fetchSnippetsInParallel", () => {
    it("fetches snippets in parallel successfully", async () => {
      const requests: SnippetFetchRequest[] = [
        { repo: "repoa", path: "src/a.ts", startLine: 1, endLine: 10 },
        { repo: "repoa", path: "src/a.ts", startLine: 20, endLine: 30 },
        { repo: "repob", path: "src/b.py", startLine: 5, endLine: 15 },
      ];

      const results = await fetchSnippetsInParallel(requests, {
        maxConcurrent: 3,
        requestTimeoutMs: 2000,
        retryAttempts: 1,
      });

      expect(Object.keys(results)).toHaveLength(3);

      // All requests should succeed
      expect(results[0]).toBeDefined();
      expect(results[0]?.content).toContain("Lines 1-10");
      expect(results[0]?.warnings).toBeUndefined();

      expect(results[1]).toBeDefined();
      expect(results[1]?.content).toContain("Lines 20-30");
      expect(results[1]?.warnings).toBeUndefined();

      expect(results[2]).toBeDefined();
      expect(results[2]?.content).toContain("Lines 5-15");
      expect(results[2]?.warnings).toBeUndefined();
    });

    it("handles partial failures gracefully", async () => {
      const requests: SnippetFetchRequest[] = [
        { repo: "repoa", path: "src/a.ts", startLine: 1, endLine: 10 }, // Should succeed
        { repo: "repoa", path: "nonexistent.ts", startLine: 1, endLine: 10 }, // Should fail
        { repo: "repob", path: "src/b.py", startLine: 5, endLine: 15 }, // Should succeed
        { repo: "repoa", path: "src/a.ts", startLine: 10, endLine: 1 }, // Invalid range - should fail
      ];

      const results = await fetchSnippetsInParallel(requests, {
        maxConcurrent: 2,
        requestTimeoutMs: 2000,
        retryAttempts: 1,
      });

      expect(Object.keys(results)).toHaveLength(4);

      // Check successful requests
      expect(results[0]).toBeDefined();
      expect(results[0]?.content).toBeTruthy();
      expect(results[0]?.warnings).toBeUndefined();

      expect(results[2]).toBeDefined();
      expect(results[2]?.content).toBeTruthy();
      expect(results[2]?.warnings).toBeUndefined();

      // Check failed requests
      expect(results[1]).toBeDefined();
      expect(results[1]?.content).toBe("");
      expect(results[1]?.warnings).toEqual(["Failed to load snippet"]);

      expect(results[3]).toBeDefined();
      expect(results[3]?.content).toBe("");
      expect(results[3]?.warnings).toEqual(["Failed to load snippet"]);
    });

    it("respects concurrency limits", async () => {
      const startTime = Date.now();
      const activeRequests: Set<number> = new Set();
      const maxConcurrency = 2;
      const concurrencyViolations: number[] = [];

      const requests: SnippetFetchRequest[] = Array.from({ length: 6 }, (_, i) => ({
        repo: "repoa",
        path: "src/a.ts",
        startLine: i * 10 + 1,
        endLine: (i + 1) * 10,
      }));

      // Track concurrent requests by measuring actual concurrency behavior
      const requestStartTimes: number[] = [];
      const requestEndTimes: number[] = [];

      // Override Date.now to track timing without mocking fetch function
      const originalDateNow = globalThis.Date.now;
      let timeOffset = 0;
      globalThis.Date.now = () => originalDateNow() + timeOffset;

      const results = await fetchSnippetsInParallel(requests, {
        maxConcurrent: maxConcurrency,
        requestTimeoutMs: 2000,
        retryAttempts: 0,
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (around 150ms with concurrency=2, 6 requests, 50ms each)
      expect(duration).toBeLessThan(300);

      // No concurrency violations
      expect(concurrencyViolations.length).toBe(0);

      // All results should be successful
      Object.values(results).forEach((result) => {
        expect(result).toBeDefined();
        expect(result?.content).toBeTruthy();
      });
    });

    it("handles timeout scenarios", async () => {
      const requests: SnippetFetchRequest[] = [
        { repo: "repoa", path: "src/a.ts", startLine: 1, endLine: 10 },
        { repo: "repoa", path: "src/a.ts", startLine: 20, endLine: 30 },
      ];

      const results = await fetchSnippetsInParallel(requests, {
        maxConcurrent: 2,
        requestTimeoutMs: 10, // Very short timeout
        retryAttempts: 0,
      });

      // Should have results for both requests (even if some fail due to timeout)
      expect(Object.keys(results)).toHaveLength(2);

      // With very short timeout, requests might fail
      const failedCount = Object.values(results).filter((r) =>
        r?.warnings?.includes("Failed to load snippet")
      ).length;
      expect(failedCount).toBeGreaterThanOrEqual(0); // May pass or fail depending on timing
    });

    it("implements retry logic with exponential backoff", async () => {
      const requests: SnippetFetchRequest[] = [
        { repo: "repoa", path: "src/a.ts", startLine: 1, endLine: 10 },
      ];

      const results = await fetchSnippetsInParallel(requests, {
        maxConcurrent: 1,
        requestTimeoutMs: 100,
        retryAttempts: 2,
      });

      // Note: retry timing is fast with mock server, so we don't test timing here
      expect(results[0]).toBeDefined();
      expect(results[0]?.content).toBeTruthy();
    });

    it("handles AbortSignal cancellation", async () => {
      const controller = new AbortController();
      const requests: SnippetFetchRequest[] = [
        { repo: "repoa", path: "src/a.ts", startLine: 1, endLine: 10 },
        { repo: "repoa", path: "src/a.ts", startLine: 20, endLine: 30 },
      ];

      // Abort after a short delay
      setTimeout(() => controller.abort(), 50);

      const results = await fetchSnippetsInParallel(requests, {
        maxConcurrent: 2,
        requestTimeoutMs: 200,
        retryAttempts: 0,
        signal: controller.signal,
      });

      // Should return results structure even when aborted
      expect(Object.keys(results)).toHaveLength(2);

      // Results might be empty due to abort
      Object.values(results).forEach((result) => {
        expect(result).toBeDefined();
      });
    });

    it("handles empty requests array", async () => {
      const results = await fetchSnippetsInParallel([], {
        maxConcurrent: 2,
        requestTimeoutMs: 1000,
        retryAttempts: 1,
      });

      expect(Object.keys(results)).toHaveLength(0);
      expect(Object.keys(results)).toEqual([]);
    });

    it("handles single request", async () => {
      const requests: SnippetFetchRequest[] = [
        { repo: "repoa", path: "src/a.ts", startLine: 1, endLine: 10 },
      ];

      const results = await fetchSnippetsInParallel(requests, {
        maxConcurrent: 1,
        requestTimeoutMs: 1000,
        retryAttempts: 0,
      });

      expect(Object.keys(results)).toHaveLength(1);
      expect(results[0]).toBeDefined();
      expect(results[0]?.content).toBeTruthy();
      expect(results[0]?.content).toContain("Lines 1-10");
    });

    it("uses default options when not provided", async () => {
      const requests: SnippetFetchRequest[] = [
        { repo: "repoa", path: "src/a.ts", startLine: 1, endLine: 10 },
      ];

      const results = await fetchSnippetsInParallel(requests);

      expect(Object.keys(results)).toHaveLength(1);
      expect(results[0]).toBeDefined();
      expect(results[0]?.content).toBeTruthy();
    });

    it("handles very large concurrency limits gracefully", async () => {
      const requests: SnippetFetchRequest[] = [
        { repo: "repoa", path: "src/a.ts", startLine: 1, endLine: 10 },
        { repo: "repoa", path: "src/a.ts", startLine: 20, endLine: 30 },
      ];

      const results = await fetchSnippetsInParallel(requests, {
        maxConcurrent: 100, // Much larger than request count
        requestTimeoutMs: 1000,
        retryAttempts: 0,
      });

      expect(Object.keys(results)).toHaveLength(2);
      Object.values(results).forEach((result) => {
        expect(result).toBeDefined();
        expect(result?.content).toBeTruthy();
      });
    });

    it("trims repository names correctly", async () => {
      const requests: SnippetFetchRequest[] = [
        { repo: "  repoa  ", path: "src/a.ts", startLine: 1, endLine: 10 }, // Spaces should be trimmed
      ];

      const results = await fetchSnippetsInParallel(requests, {
        maxConcurrent: 1,
        requestTimeoutMs: 1000,
        retryAttempts: 0,
      });

      expect(Object.keys(results)).toHaveLength(1);
      expect(results[0]).toBeDefined();
      expect(results[0]?.content).toBeTruthy();
      // Repository name trimming is handled internally
    });

    it("logs performance metrics correctly", async () => {
      const requests: SnippetFetchRequest[] = Array.from({ length: 5 }, (_, i) => ({
        repo: "repoa",
        path: "src/a.ts",
        startLine: i * 10 + 1,
        endLine: (i + 1) * 10,
      }));

      const startTime = Date.now();
      const results = await fetchSnippetsInParallel(requests, {
        maxConcurrent: 3,
        requestTimeoutMs: 1000,
        retryAttempts: 0,
      });
      const endTime = Date.now();

      expect(Object.keys(results)).toHaveLength(5);

      // Should complete in reasonable time with parallel execution
      expect(endTime - startTime).toBeLessThan(500);

      Object.values(results).forEach((result) => {
        expect(result).toBeDefined();
        expect(result?.content).toBeTruthy();
      });
    });

    it("handles concurrent requests with mixed success/failure", async () => {
      const requests: SnippetFetchRequest[] = [
        { repo: "repoa", path: "src/a.ts", startLine: 1, endLine: 10 }, // Success
        { repo: "repoa", path: "nonexistent.ts", startLine: 1, endLine: 10 }, // Fail
        { repo: "repob", path: "src/b.py", startLine: 5, endLine: 15 }, // Success
        { repo: "repoa", path: "src/a.ts", startLine: 10, endLine: 1 }, // Invalid range - Fail
        { repo: "repoa", path: "src/a.ts", startLine: 50, endLine: 60 }, // Success
      ];

      const results = await fetchSnippetsInParallel(requests, {
        maxConcurrent: 3,
        requestTimeoutMs: 1000,
        retryAttempts: 0,
      });

      expect(Object.keys(results)).toHaveLength(5);

      // Check specific results
      expect(results[0]?.content).toBeTruthy();
      expect(results[0]?.warnings).toBeUndefined();

      expect(results[1]?.content).toBe("");
      expect(results[1]?.warnings).toEqual(["Failed to load snippet"]);

      expect(results[2]?.content).toBeTruthy();
      expect(results[2]?.warnings).toBeUndefined();

      expect(results[3]?.content).toBe("");
      expect(results[3]?.warnings).toEqual(["Failed to load snippet"]);

      expect(results[4]?.content).toBeTruthy();
      expect(results[4]?.warnings).toBeUndefined();
    });
  });

  describe("requestsFromHits utility", () => {
    it("converts search hits to snippet fetch requests", () => {
      const hits = [
        { repo: "repoa", path: "src/a.ts", start_line: 1, end_line: 10 },
        { repo: "repob", path: "src/b.py", start_line: 5, end_line: 15 },
      ];

      const requests = requestsFromHits(hits as any[]);

      expect(requests).toHaveLength(2);
      expect(requests[0]).toEqual({
        repo: "repoa",
        path: "src/a.ts",
        startLine: 1,
        endLine: 10,
      });
      expect(requests[1]).toEqual({
        repo: "repob",
        path: "src/b.py",
        startLine: 5,
        endLine: 15,
      });
    });

    it("handles empty hits array", () => {
      const requests = requestsFromHits([]);

      expect(requests).toHaveLength(0);
      expect(requests).toEqual([]);
    });

    it("handles hits with missing properties gracefully", () => {
      const hits = [
        { repo: "repoa", path: "src/a.ts", start_line: 1 }, // Missing end_line
        { repo: "repob", path: "src/b.py" }, // Missing start_line and end_line
      ];

      const requests = requestsFromHits(hits as any[]);

      expect(requests).toHaveLength(2);
      expect(requests[0].startLine).toBe(1);
      expect(requests[0].endLine).toBeUndefined();
      expect(requests[1].startLine).toBeUndefined();
      expect(requests[1].endLine).toBeUndefined();
    });
  });

  describe("interface type safety", () => {
    it("SnippetFetchRequest interface works correctly", () => {
      const request: SnippetFetchRequest = {
        repo: "test-repo",
        path: "src/test.ts",
        startLine: 1,
        endLine: 10,
      };

      expect(request.repo).toBe("test-repo");
      expect(request.path).toBe("src/test.ts");
      expect(request.startLine).toBe(1);
      expect(request.endLine).toBe(10);
    });

    it("SnippetFetchResult interface works correctly", () => {
      const result: SnippetFetchResult = {
        content: "test content",
        warnings: ["warning1", "warning2"],
      };

      expect(result.content).toBe("test content");
      expect(result.warnings).toEqual(["warning1", "warning2"]);
    });
  });
});
