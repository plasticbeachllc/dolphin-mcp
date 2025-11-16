const JSON_HEADERS = { "Content-Type": "application/json" } as const;

interface RepoCache {
  repos: Array<{
    name: string;
    path: string;
    default_embed_model: string;
    files: number;
    chunks: number;
  }>;
}

function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request) {
    return input;
  }

  if (typeof input === "string" || input instanceof URL) {
    return new Request(input, init);
  }

  return new Request(String(input ?? ""), init);
}

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: HeadersInit = JSON_HEADERS
): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

function htmlResponse(payload: string, status = 200): Response {
  return new Response(payload, { status, headers: { "Content-Type": "text/html" } });
}

export function startMockRest(port = 7777): Promise<() => Promise<void>> {
  const baseUrl = `http://127.0.0.1:${port}`;
  const originalFetch = globalThis.fetch;

  const repoCache: RepoCache = {
    repos: [
      { name: "repoa", path: "/abs/repoa", default_embed_model: "small", files: 1, chunks: 2 },
      { name: "repob", path: "/abs/repob", default_embed_model: "large", files: 3, chunks: 5 },
    ],
  };

  async function handleRequest(req: Request): Promise<Response> {
    await Promise.resolve();
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    const sendNotFound = () =>
      jsonResponse({ error: { code: "not_found", message: "not found" } }, 404);

    const readJsonBody = async () => {
      const raw = await req.text();
      return raw ? JSON.parse(raw) : {};
    };

    // GET /repos (v1 + legacy)
    if (method === "GET" && (pathname === "/v1/repos" || pathname === "/repos")) {
      return jsonResponse(repoCache);
    }

    // GET /chunks/{id}
    if (
      method === "GET" &&
      (pathname.startsWith("/v1/chunks/") || pathname.startsWith("/chunks/"))
    ) {
      const id = decodeURIComponent(pathname.split("/").pop() ?? "");

      if (id === "not-found") {
        return jsonResponse(
          { error: { code: "chunk_not_found", message: "Chunk not found" } },
          404
        );
      }

      return jsonResponse({
        chunk_id: id,
        repo: "repoa",
        path: "src/a.ts",
        lang: "typescript",
        start_line: 1,
        end_line: 10,
        content: "export const a = 1;\n// Some code here\nfunction test() {}\n",
        resource_link: "kb://repoa/src/a.ts#L1-L10",
      });
    }

    // GET /file
    if (method === "GET" && (pathname === "/v1/file" || pathname === "/file")) {
      const path = url.searchParams.get("path") ?? "src/a.ts";
      const start = Number(url.searchParams.get("start") ?? "1");
      const end = Number(url.searchParams.get("end") ?? "10");
      const repo = url.searchParams.get("repo") ?? "repoa";

      if (path === "nonexistent.ts") {
        return jsonResponse({ error: { code: "file_not_found", message: "File not found" } }, 404);
      }

      if (start > end) {
        return jsonResponse(
          { error: { code: "invalid_range", message: "Invalid line range" } },
          400
        );
      }

      const lang = path.endsWith(".ts") ? "typescript" : path.endsWith(".py") ? "python" : "plain";

      return jsonResponse({
        repo,
        path,
        start_line: start,
        end_line: end,
        content: `// Lines ${start}-${end}\nconst content = 'slice';`,
        lang,
        source: "disk",
      });
    }

    // POST /search
    if (method === "POST" && (pathname === "/v1/search" || pathname === "/search")) {
      const body = await readJsonBody();
      const { query, repos, path_prefix, top_k, cursor, deadline_ms } = body;

      if (query === "trigger-500") {
        return jsonResponse(
          { error: { code: "internal_error", message: "Internal server error" } },
          500
        );
      }

      if (query === "trigger-invalid-json") {
        return htmlResponse("<!DOCTYPE html><html><body>Internal Server Error</body></html>");
      }

      if (repos && repos.some((r: string) => r.trim() === "nonexistent-repo")) {
        return jsonResponse(
          { error: { code: "repo_not_found", message: "Repository not found" } },
          404
        );
      }

      if (deadline_ms === 1) {
        return jsonResponse({
          hits: [
            {
              repo: "repoa",
              path: "src/a.ts",
              lang: "typescript",
              start_line: 1,
              end_line: 20,
              score: 0.9,
              snippet: "export const a = 1",
              chunk_id: "1",
              resource_link: "kb://repoa/src/a.ts#L1-L20",
            },
          ],
          meta: {
            top_k: top_k || 5,
            model: "text-embedding-3-small",
            cursor: "partial-cursor",
            estimated_total: 10,
            complete: false,
            warnings: ["deadline_exceeded"],
          },
        });
      }

      if (body.embed_model === "unavailable") {
        return jsonResponse(
          { error: { code: "embeddings_unavailable", message: "Embeddings service unavailable" } },
          503
        );
      }

      let hits: any[] = [];
      if (query) {
        if (typeof query === "string" && query.toLowerCase().includes("ingestion")) {
          hits = [
            {
              repo: "repoa",
              path: "kb/ingest/pipeline.py",
              lang: "python",
              start_line: 1,
              end_line: 40,
              score: 0.96,
              snippet: "def run_pipeline(...):\n    pass",
              chunk_id: "ing-1",
              resource_link: "kb://repoa/kb/ingest/pipeline.py#L1-L40",
            },
            {
              repo: "repoa",
              path: "kb/chunkers/md_chunker.py",
              lang: "python",
              start_line: 10,
              end_line: 80,
              score: 0.88,
              snippet: "class MdChunker:\n    pass",
              chunk_id: "ing-2",
              resource_link: "kb://repoa/kb/chunkers/md_chunker.py#L10-L80",
            },
            {
              repo: "repoa",
              path: ".continue/agents/personas_config.yaml",
              lang: "yaml",
              start_line: 1,
              end_line: 200,
              score: 0.99,
              snippet:
                "name: Dolphin Personas\nversion: 0.1.1\nschema: v1\nmodels:\n- name: Chief of Staff",
              chunk_id: "noise-1",
              resource_link: "kb://repoa/.continue/agents/personas_config.yaml#L1-L200",
            },
          ];
        } else if (query === "large-snippet") {
          hits = [
            {
              repo: "repoa",
              path: "src/a.ts",
              lang: "typescript",
              start_line: 1,
              end_line: 20,
              score: 0.9,
              snippet: "x".repeat(600),
              chunk_id: "1",
              resource_link: "kb://repoa/src/a.ts#L1-L20",
            },
          ];
        } else {
          hits = [
            {
              repo: "repoa",
              path: "src/a.ts",
              lang: "typescript",
              start_line: 1,
              end_line: 20,
              score: 0.9,
              snippet: "export const a = 1",
              chunk_id: "1",
              resource_link: "kb://repoa/src/a.ts#L1-L20",
            },
            {
              repo: "repob",
              path: "src/b.py",
              lang: "python",
              start_line: 5,
              end_line: 15,
              score: 0.8,
              snippet: "def test_function():\n    return True",
              chunk_id: "2",
              resource_link: "kb://repob/src/b.py#L5-L15",
            },
          ];
        }
      }

      return jsonResponse({
        hits,
        meta: {
          top_k: top_k || 5,
          model: body.embed_model || "text-embedding-3-small",
          cursor: cursor || (hits.length ? "opaque-cursor" : undefined),
          estimated_total: hits.length,
          complete: true,
          warnings: top_k && top_k > 100 ? ["top_k clamped to 100"] : [],
        },
      });
    }

    if (method === "GET" && pathname === "/v1/health") {
      return jsonResponse({ status: "healthy", version: "0.1.0" });
    }

    return sendNotFound();
  }

  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = toRequest(input, init);
    const url = new URL(request.url);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);

    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    if (!url.origin.startsWith("http://127.0.0.1")) {
      if (originalFetch) {
        return originalFetch(input as RequestInfo, init as RequestInit);
      }
      throw new Error(`Mock REST cannot reach ${request.url}`);
    }

    const responsePromise = handleRequest(request);

    if (!signal) {
      return responsePromise;
    }

    return await Promise.race([
      responsePromise,
      new Promise<Response>((_, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted.", "AbortError")),
          { once: true }
        );
      }),
    ]);
  };

  globalThis.fetch = mockFetch;
  process.env.KB_REST_BASE_URL = baseUrl;

  return Promise.resolve(async () => {
    globalThis.fetch = originalFetch;
    delete process.env.KB_REST_BASE_URL;
  });
}
