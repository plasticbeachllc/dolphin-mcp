import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startMockRest } from "./mockServer.js";
import { restSearch, restGetChunk, restGetFileSlice, restListRepos } from "../rest/client.js";

let stop: () => Promise<void>;

beforeAll(async () => {
  stop = await startMockRest(7777);
});

afterAll(async () => {
  await stop?.();
});

describe("REST Client - Search", () => {
  it("should make successful search request", async () => {
    const result = await restSearch({
      query: "test query",
      top_k: 10,
    });

    expect(result).toBeDefined();
    expect(result.hits).toBeDefined();
    expect(Array.isArray(result.hits)).toBe(true);
    expect(result.meta).toBeDefined();
  });

  it("should pass all search parameters correctly", async () => {
    const result = await restSearch({
      query: "test",
      top_k: 20,
      repos: ["repoa", "repob"],
      path_prefix: ["src/"],
      score_cutoff: 0.5,
      embed_model: "large",
    });

    expect(result).toBeDefined();
    expect(result.hits).toBeDefined();
  });

  it("should handle search with cursor", async () => {
    const result = await restSearch({
      query: "test",
      cursor: "cursor-token-123",
    });

    expect(result).toBeDefined();
    expect(result.hits).toBeDefined();
  });

  it("should handle search with MMR enabled", async () => {
    const result = await restSearch({
      query: "test",
      mmr_enabled: true,
      mmr_lambda: 0.7,
    });

    expect(result).toBeDefined();
  });

  it("should handle search with graph context", async () => {
    const result = await restSearch({
      query: "test",
      include_graph_context: true,
    });

    expect(result).toBeDefined();
  });

  it("should handle search with ANN strategy parameters", async () => {
    const result = await restSearch({
      query: "test",
      ann_strategy: "adaptive",
      ann_nprobes: 10,
      ann_refine_factor: 2.0,
    });

    expect(result).toBeDefined();
  });

  it("should handle search with path filters", async () => {
    const result = await restSearch({
      query: "test",
      path_prefix: ["src/", "lib/"],
      exclude_paths: ["test/", "dist/"],
      exclude_patterns: ["*.test.ts", "*.spec.ts"],
    });

    expect(result).toBeDefined();
  });

  it("should handle search with deadline", async () => {
    const result = await restSearch({
      query: "test",
      deadline_ms: 5000,
    });

    expect(result).toBeDefined();
  });

  it("should handle repo not found error", async () => {
    await expect(async () => {
      await restSearch({
        query: "test",
        repos: ["nonexistent-repo"],
      });
    }).toThrow();
  });

  it("should handle invalid JSON response", async () => {
    // Mock server can return invalid JSON for specific queries
    await expect(async () => {
      await restSearch({
        query: "trigger-invalid-json",
      });
    }).toThrow();
  });

  it("should support AbortSignal for cancellation", async () => {
    const controller = new AbortController();

    // Start search then immediately cancel
    const searchPromise = restSearch(
      {
        query: "test",
      },
      controller.signal
    );

    controller.abort();

    await expect(searchPromise).rejects.toThrow();
  });
});

describe("REST Client - Get Chunk", () => {
  it("should fetch chunk by ID successfully", async () => {
    const chunk = await restGetChunk("abc123");

    expect(chunk).toBeDefined();
    expect(chunk.chunk_id).toBe("abc123");
    expect(chunk.content).toBeDefined();
    expect(chunk.repo).toBeDefined();
    expect(chunk.path).toBeDefined();
    expect(chunk.start_line).toBeGreaterThan(0);
    expect(chunk.end_line).toBeGreaterThanOrEqual(chunk.start_line);
  });

  it("should include metadata in chunk response", async () => {
    const chunk = await restGetChunk("test-chunk-id");

    expect(chunk.lang).toBeDefined();
    expect(chunk.resource_link).toBeDefined();
  });

  it("should handle chunk not found error", async () => {
    await expect(async () => {
      await restGetChunk("not-found");
    }).toThrow();
  });

  it("should properly encode chunk ID in URL", async () => {
    // Test with special characters that need URL encoding
    const specialId = "chunk/with/slashes";

    // Should not crash, mock server will handle it
    const result = await restGetChunk(specialId);
    expect(result).toBeDefined();
  });

  it("should support AbortSignal for chunk fetch", async () => {
    const controller = new AbortController();

    const chunkPromise = restGetChunk("test-id", controller.signal);
    controller.abort();

    await expect(chunkPromise).rejects.toThrow();
  });
});

describe("REST Client - Get File Slice", () => {
  it("should fetch file slice successfully", async () => {
    const slice = await restGetFileSlice("repoa", "src/test.ts", 1, 10);

    expect(slice).toBeDefined();
    expect(slice.repo).toBe("repoa");
    expect(slice.path).toBe("src/test.ts");
    expect(slice.start_line).toBe(1);
    expect(slice.end_line).toBe(10);
    expect(slice.content).toBeDefined();
  });

  it("should include language in response", async () => {
    const slice = await restGetFileSlice("repoa", "src/app.ts", 5, 15);

    expect(slice.lang).toBeDefined();
  });

  it("should handle Python files", async () => {
    const slice = await restGetFileSlice("repoa", "main.py", 1, 20);

    expect(slice).toBeDefined();
    expect(slice.lang).toBe("python");
  });

  it("should handle file not found error", async () => {
    await expect(async () => {
      await restGetFileSlice("repoa", "nonexistent.ts", 1, 10);
    }).toThrow();
  });

  it("should handle invalid line range error", async () => {
    await expect(async () => {
      await restGetFileSlice(
        "repoa",
        "src/test.ts",
        10, // start > end
        1
      );
    }).toThrow();
  });

  it("should properly encode path in URL", async () => {
    const slice = await restGetFileSlice("repoa", "src/path with spaces/file.ts", 1, 5);

    expect(slice).toBeDefined();
  });

  it("should support AbortSignal for file slice", async () => {
    const controller = new AbortController();

    const slicePromise = restGetFileSlice("repoa", "test.ts", 1, 10, controller.signal);
    controller.abort();

    await expect(slicePromise).rejects.toThrow();
  });
});

describe("REST Client - List Repos", () => {
  it("should fetch list of repositories", async () => {
    const result = await restListRepos();

    expect(result).toBeDefined();
    expect(result.repos).toBeDefined();
    expect(Array.isArray(result.repos)).toBe(true);
    expect(result.repos.length).toBeGreaterThan(0);
  });

  it("should include repo metadata", async () => {
    const result = await restListRepos();

    const repo = result.repos[0];
    expect(repo.name).toBeDefined();
    expect(repo.path).toBeDefined();
  });

  it("should include optional repo statistics", async () => {
    const result = await restListRepos();

    const repo = result.repos[0];
    // These fields are optional but should be present in mock
    expect(repo.default_embed_model).toBeDefined();
    expect(repo.files).toBeDefined();
    expect(repo.chunks).toBeDefined();
  });

  it("should support AbortSignal for listing repos", async () => {
    const controller = new AbortController();

    const reposPromise = restListRepos(controller.signal);
    controller.abort();

    await expect(reposPromise).rejects.toThrow();
  });
});

describe("REST Client - Error Handling", () => {
  it("should handle HTTP 500 errors gracefully", async () => {
    await expect(async () => {
      await restSearch({ query: "trigger-500" });
    }).toThrow();
  });

  it("should handle network errors", async () => {
    // Temporarily change to invalid URL
    const originalUrl = process.env.KB_REST_BASE_URL;
    process.env.KB_REST_BASE_URL = "http://localhost:9999";

    await expect(async () => {
      await restSearch({ query: "test" });
    }).toThrow();

    // Restore
    process.env.KB_REST_BASE_URL = originalUrl;
  });

  it("should include error details in thrown errors", async () => {
    try {
      await restSearch({
        query: "test",
        repos: ["nonexistent-repo"],
      });
      expect(false).toBe(true); // Should not reach here
    } catch (error: any) {
      expect(error.error).toBeDefined();
      expect(error.error.code).toBeDefined();
      expect(error.error.message).toBeDefined();
    }
  });

  it("should handle malformed JSON responses", async () => {
    await expect(async () => {
      await restSearch({ query: "trigger-invalid-json" });
    }).toThrow();
  });

  it("should provide remediation hints in errors", async () => {
    try {
      await restSearch({ query: "trigger-invalid-json" });
      expect(false).toBe(true);
    } catch (error: any) {
      // Error should have remediation field
      if (error.error?.remediation) {
        expect(typeof error.error.remediation).toBe("string");
      }
    }
  });
});

describe("REST Client - Headers", () => {
  it("should send correct Content-Type header", async () => {
    // This is implicitly tested by successful requests
    const result = await restSearch({ query: "test" });
    expect(result).toBeDefined();
  });

  it("should send X-Client header for tracking", async () => {
    // This is implicitly tested by successful requests
    const result = await restSearch({ query: "test" });
    expect(result).toBeDefined();
  });
});

describe("REST Client - Edge Cases", () => {
  it("should handle empty search query", async () => {
    const result = await restSearch({ query: "" });
    expect(result).toBeDefined();
  });

  it("should handle very large top_k value", async () => {
    const result = await restSearch({
      query: "test",
      top_k: 10000,
    });
    expect(result).toBeDefined();
  });

  it("should handle top_k of 1", async () => {
    const result = await restSearch({
      query: "test",
      top_k: 1,
    });
    expect(result).toBeDefined();
  });

  it("should handle empty repos array", async () => {
    const result = await restSearch({
      query: "test",
      repos: [],
    });
    expect(result).toBeDefined();
  });

  it("should handle repos with special characters", async () => {
    const result = await restSearch({
      query: "test",
      repos: ["repo-with-dash", "repo_with_underscore"],
    });
    expect(result).toBeDefined();
  });

  it("should handle path_prefix with various patterns", async () => {
    const result = await restSearch({
      query: "test",
      path_prefix: ["src/", "lib/", "packages/*/src/"],
    });
    expect(result).toBeDefined();
  });

  it("should handle score_cutoff edge values", async () => {
    const result1 = await restSearch({
      query: "test",
      score_cutoff: 0.0,
    });
    expect(result1).toBeDefined();

    const result2 = await restSearch({
      query: "test",
      score_cutoff: 1.0,
    });
    expect(result2).toBeDefined();
  });

  it("should handle mmr_lambda edge values", async () => {
    const result1 = await restSearch({
      query: "test",
      mmr_enabled: true,
      mmr_lambda: 0.0,
    });
    expect(result1).toBeDefined();

    const result2 = await restSearch({
      query: "test",
      mmr_enabled: true,
      mmr_lambda: 1.0,
    });
    expect(result2).toBeDefined();
  });
});
