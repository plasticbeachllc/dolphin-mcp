# PB KB MCP Bridge - Project Guide

**Status**: Sprint 1 (v0.2.0)  
**Type**: Model Context Protocol (MCP) Server  
**Runtime**: Bun  
**Language**: TypeScript

---

## Project Overview

**PB KB MCP Bridge** is a Model Context Protocol server that bridges the Continue IDE with a code knowledge base retrieval service. It exposes tools for searching, fetching, and analyzing code across indexed repositories through a standardized MCP interface.

### Key Technologies
- **Runtime**: Bun (fast JavaScript runtime)
- **Protocol**: Model Context Protocol (MCP) v2025-06-18
- **Language**: TypeScript (strict mode)
- **Validation**: Zod + JSON schema generation
- **Logging**: JSON-structured logs with rotation

### Architecture

```
Continue IDE
    ↓ (MCP via stdio)
    ↓
MCP Server (stdio transport)
    ↓ (HTTP REST)
    ↓
KB Retriever Service (localhost:7777)
```

The bridge:
1. Receives tool calls from Continue via stdio
2. Validates inputs using Zod schemas
3. Calls the KB retriever REST API
4. Transforms responses into MCP format
5. Returns results with embedded resources and citations

---

## Getting Started

### Prerequisites
- **Bun** ≥ 1.0 (fast JavaScript runtime)
  - Install: `curl -fsSL https://bun.sh/install | bash`
- **Node.js** 20.12.7+ (TypeScript types)
- **KB Retriever Service** running on `127.0.0.1:7777` (for runtime; not needed for building)

### Installation

```bash
# Navigate to project
cd mcp-bridge

# Install dependencies
bun install

# Build TypeScript to JavaScript
bun run build

# Or with tsc directly
bun x tsc -p tsconfig.json
```

### Running the Server

**Development (with hot reload)**
```bash
bun run dev
# or: bun run --hot src/index.ts
```

**Production (prebuilt)**
```bash
bun run start
# or: ./dist/cli.js (requires shebang setup)
```

**Via Continue Configuration**

Add to your Continue config:
```json
{
  "serverCommand": "bun",
  "serverArgs": ["run", "mcp-bridge/src/index.ts"]
}
```

Or post-build:
```json
{
  "serverCommand": "mcp-bridge/dist/cli.js"
}
```

### Testing

**Unit Tests** (uses mock HTTP server)
```bash
bun test
```

**Integration Tests** (requires real KB service)
```bash
# Start KB retriever on 127.0.0.1:7777
# Then run integration harness
bun run src/tests/integration_test_harness.ts
```

### Logs

- **Location**: `mcp-bridge/logs/mcp.log`
- **Format**: JSON lines
- **Rotation**: 5 MB max per file, keeps 3 rotated files (`mcp.log.1`, `.2`, `.3`)
- **No stdout**: All logging to file to prevent MCP protocol pollution

---

## Project Structure

### `src/index.ts`
Entry point for development. Initializes the logger and creates the MCP server, catching startup errors.

### `src/cli.ts`
Binary entry point (shebang: `#!/usr/bin/env bun`). Simple wrapper around server creation.

### `src/mcp/`
**MCP Server Core**

- `server.ts`: Creates the MCP server, registers tools, and connects via stdio transport
- `tools/index.ts`: Exports all registered tools
- `tools/`: Individual tool implementations

### `src/mcp/tools/`

Each tool is a self-contained module with a factory function `make[ToolName]()` that returns:
- `definition`: MCP tool metadata (name, description, JSON schema)
- `handler`: Async function executing the tool
- `inputSchema`: Zod shape for type safety

**Tools:**

| Tool | Purpose |
|------|---------|
| `search_knowledge.ts` | Query code across repos; returns ranked snippets with citations |
| `fetch_chunk.ts` | Get full chunk by ID |
| `fetch_lines.ts` | Get file lines by repo/path/range |
| `open_in_editor.ts` | Generate editor URIs (vscode://) for code locations |
| `get_vector_store_info.ts` | Get namespace/model/chunk count stats |
| `get_metadata.ts` | Get metadata for a chunk (repo, path, symbol info, etc.) |

### `src/rest/`
**HTTP Client to KB Service**

- `client.ts`: Type definitions and fetch wrappers for `/v1/*` endpoints
  - `GET /v1/repos`: List indexed repositories
  - `POST /v1/search`: Semantic search with filters
  - `GET /v1/chunks/{id}`: Fetch chunk by ID
  - `GET /v1/file`: Get file slice [start, end]

### `src/util/`
**Utility Functions**

| Module | Purpose |
|--------|---------|
| `logger.ts` | Structured JSON logging with size-based rotation |
| `language.ts` | Map file extensions → fenced code block languages |
| `mime.ts` | Infer MIME types from language or file path |
| `payloadCap.ts` | Calculate JSON payload size in bytes |

### `src/tests/`
**Test Suite**

| Test | Scope |
|------|-------|
| `search_knowledge.test.ts` | Search input validation, response formatting, trimming |
| `fetch_chunk.test.ts` | Chunk retrieval, error handling |
| `fetch_lines.test.ts` | File slicing, range validation |
| `get_vector_store_info.test.ts` | Namespace and stats reporting |
| `get_metadata.test.ts` | Metadata enrichment |
| `open_in_editor.test.ts` | URI generation |
| `security_and_connectivity.test.ts` | Timeout, abort, signal handling |
| `logging_and_concurrency.test.ts` | Concurrent tool calls, log rotation |
| `mockServer.ts` | Mock HTTP server for tests |
| `integration_test_harness.ts` | Manual integration test runner |

### Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, build/test/lint scripts |
| `tsconfig.json` | Strict TypeScript with ES2022 target, ESNext modules |
| `.eslintrc.cjs` | ESLint config (Standard + TypeScript) |
| `.gitignore` | Ignore node_modules, dist, logs |

---

## Development Workflow

### Coding Standards

- **TypeScript**: Strict mode, always enable
- **Validation**: Use Zod for all external input (REST responses, tool args)
- **Logging**: Use `logInfo`, `logWarn`, `logError` from `util/logger.ts`
- **Error Handling**: Catch errors in tool handlers; return `{ content, isError: true, _meta }`
- **Resources**: Return `EmbeddedResource` objects with URIs and MIME types
- **Payload**: Stay under ~50KB per search response (uses trimming strategy)

### Testing

1. **Unit tests**: Mock the HTTP server; test input validation, edge cases, error paths
2. **Integration tests**: Spin up real KB service; test end-to-end flows
3. **Concurrency**: Test multiple concurrent tool calls; verify logging doesn't corrupt

### Build Process

```bash
# Type check + compile
bun x tsc -p tsconfig.json

# Outputs to: dist/
# Files: cli.js, index.js, mcp/server.js, rest/client.js, util/*.js, mcp/tools/*.js
```

### Linting

```bash
bun run lint
# Standard + TypeScript ESLint config
```

### Adding a New Tool

1. Create `src/mcp/tools/my_tool.ts`
2. Define Zod input schema
3. Export factory function: `export function makeMyTool()`
4. Add to `src/mcp/tools/index.ts` → `tools` array
5. Write tests in `src/tests/my_tool.test.ts`
6. Build & test: `bun run build && bun test`

---

## Key Concepts

### Payload Trimming Strategy

The **search_knowledge** tool enforces a ~50KB response cap:

1. **Trim prompt-ready text** (LLM-friendly markdown)
2. **Shrink per-snippet windows** (reduce character counts)
3. **Remove snippet text from lowest-scoring results** (keep citations)
4. **Drop entire results** (starting from lowest scores)
5. **Mark as incomplete** when trimming occurs

This ensures responses fit within Continue's resource limits while preserving search quality.

### MCP Tool Format

Each tool returns a `CallToolResult`:
```typescript
{
  content: [
    { type: 'text', text: '...' },
    { type: 'resource', resource: { uri: '...', mimeType: '...', text?: '...' } }
  ],
  isError: boolean,
  _meta?: { ... }  // Custom metadata
}
```

### JSON Schema Generation

Zod schemas → JSON schemas via `zod-to-json-schema` → MCP input schemas. This ensures:
- Type safety in TypeScript
- Spec compliance in MCP
- Single source of truth for validation

### Structured Logging

All logs are JSON lines, structured for machine parsing:
```json
{
  "ts": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "event": "search",
  "message": "search_knowledge success",
  "meta": { "hits_count": 5, "latency_ms": 234 },
  "context": null
}
```

---

## Common Tasks

### Search for Code
**What**: Find code matching a query across repos
**Tool**: `search_knowledge`
**Usage**:
```typescript
await search_knowledge({
  query: "authentication middleware",
  repos: ["backend", "auth-lib"],
  top_k: 10,
  embed_model: "large"
})
```

### Fetch a Specific Chunk
**What**: Get the full content of a code chunk by ID
**Tool**: `fetch_chunk`
**Usage**:
```typescript
await fetch_chunk({ chunk_id: "abc123" })
```

### Get File Lines
**What**: Retrieve a range of lines from a file in a repo
**Tool**: `fetch_lines`
**Usage**:
```typescript
await fetch_lines({
  repo: "backend",
  path: "src/auth.ts",
  start: 10,
  end: 50
})
```

### Generate Editor Links
**What**: Create vscode:// URIs for opening code in the editor
**Tool**: `open_in_editor`
**Usage**:
```typescript
await open_in_editor({
  repo: "backend",
  path: "src/auth.ts",
  line: 25
})
```

### Debug a Tool
1. Add `logInfo`/`logWarn` calls around key steps
2. Build: `bun run build`
3. Run in dev: `bun run dev`
4. Check logs: `tail -f logs/mcp.log`
5. Parse logs: `cat logs/mcp.log | jq .` (pretty-print)

### Deploy to Production

1. Build: `bun run build`
2. Copy `dist/` to deployment target
3. Configure Continue to point to `dist/cli.js`
4. Ensure KB service is reachable (test connectivity first)
5. Monitor logs for errors

---

## Troubleshooting

### Issue: "Server failed to start"
**Cause**: KB service not running or unreachable  
**Solution**:
1. Verify KB service on `127.0.0.1:7777`
2. Test: `curl http://127.0.0.1:7777/v1/repos`
3. Check firewall rules
4. Review logs: `tail logs/mcp.log`

### Issue: "Repo not found" error
**Cause**: Repo name doesn't exist in KB index  
**Solution**:
1. List available repos: `fetch_chunk({ chunk_id: "..." })` and check response
2. Or call `/v1/repos` REST endpoint directly
3. Verify repo name spelling and casing

### Issue: Search returns truncated results
**Cause**: Response hit the 50KB payload cap  
**Solution**:
1. Reduce `top_k` (number of results)
2. Add more specific `path_prefix` filters
3. Increase `deadline_ms` for longer search
4. Use `max_snippets` to limit snippet count

### Issue: Timeout in search
**Cause**: KB service took too long  
**Solution**:
1. Increase `deadline_ms` parameter
2. Narrow search scope (filter by `repos`, `path_prefix`)
3. Check KB service performance (may need restart/scaling)

### Issue: Tests fail with "ECONNREFUSED"
**Cause**: Mock server didn't start or port in use  
**Solution**:
1. Ensure no other process on 7777: `lsof -i :7777`
2. Kill if needed: `kill -9 <pid>`
3. Re-run tests: `bun test`

### Issue: Build fails with TypeScript errors
**Cause**: Type mismatches or missing dependencies  
**Solution**:
1. Re-install deps: `bun install`
2. Type check: `bun x tsc --noEmit`
3. Review error details; fix types
4. Build: `bun run build`

### Issue: Log file grows very large
**Cause**: Rotation threshold (5 MB) not being hit, or logs not rotating  
**Solution**:
1. Check log location: `ls -lh logs/`
2. Verify rotation logic in `util/logger.ts`
3. Manually rotate if needed: `mv logs/mcp.log logs/mcp.log.1`
4. Clear if safe: `rm logs/mcp.log*` (will recreate on next run)

---

## References

### Documentation
- [MCP Specification](https://spec.modelcontextprotocol.io/) - Official MCP protocol docs
- [Zod Documentation](https://zod.dev/) - Runtime TypeScript schema validation
- [Bun Documentation](https://bun.sh/docs) - Bun runtime and APIs

### Related Files
- `docs/phase-5-mcp-bridge-spec.md` - Detailed implementation spec
- `package.json` - Dependency versions and scripts

### Important Links
- **KB Retriever Service**: http://127.0.0.1:7777 (must be running)
- **Continue IDE**: https://continue.dev/
- **Model Context Protocol**: https://modelcontextprotocol.io/

### Key Endpoints (REST API)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/repos` | List indexed repositories |
| POST | `/v1/search` | Semantic search |
| GET | `/v1/chunks/{id}` | Fetch chunk by ID |
| GET | `/v1/file` | Get file slice |

### Environment Notes
- **Node.js Compatibility**: ES2022 target with ESNext modules (requires modern Node/Bun)
- **Stdio Transport**: MCP communication is via stdin/stdout; no other I/O allowed
- **Timezone**: Logs use ISO 8601 UTC timestamps

---

## Next Steps & Maintenance

- **Keep logs monitored**: Use structured JSON parsing for alerting
- **Update dependencies**: Run `bun update` periodically
- **Test integration regularly**: Ensure KB service connectivity
- **Add new tools**: Follow the tool factory pattern in `src/mcp/tools/`
- **Scale logging**: Consider centralized log aggregation if volume increases

---

**Last Updated**: Phase 5, Sprint 1 (v0.2.0)  
**Questions?** Check logs first (`logs/mcp.log`), then review test files for examples.