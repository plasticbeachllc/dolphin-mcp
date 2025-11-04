# dolphin-mcp

[![NPM Version](https://img.shields.io/npm/v/dolphin-mcp.svg)](https://www.npmjs.com/package/dolphin-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server for Dolphin semantic code search. Conforms to [MCP spec](https://modelcontextprotocol.io/).

## Quick Start

No installation needed - use `bunx`:

```bash
bunx dolphin-mcp
```

## Configuration

### Continue.dev

Add to `config.yaml`:

```yaml
mcpServers:
  - name: Dolphin-KB
    command: bunx
    args:
      - dolphin-mcp
    env:
      DOLPHIN_API_URL: "http://127.0.0.1:7777"
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dolphin-kb": {
      "command": "bunx",
      "args": ["dolphin-mcp"],
      "env": {
        "DOLPHIN_API_URL": "http://127.0.0.1:7777"
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DOLPHIN_API_URL` | `http://127.0.0.1:7777` | Dolphin API endpoint |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |

## Available Tools

### `search_knowledge`
Semantically query code and docs across indexed repositories and return ranked snippets with citations.

```json
{
  "query": "string (required)",
  "repos": ["string"],
  "path_prefix": ["string"],
  "top_k": "number (1-100)",
  "max_snippets": "number",
  "embed_model": "small | large",
  "score_cutoff": "number"
}
```

### `fetch_chunk`
Fetch a chunk by chunk_id and return fenced code with citation.

```json
{
  "chunk_id": "string (required)"
}
```

### `fetch_lines`
Fetch a file slice [start, end] inclusive from disk and return fenced code with citation.

```json
{
  "repo": "string (required)",
  "path": "string (required)",
  "start": "number (required, 1-indexed)",
  "end": "number (required, inclusive)"
}
```

### `get_vector_store_info`
Report namespaces, dims, limits, and approximate counts.

```json
{}
```

### `open_in_editor`
Compute a vscode://file URI for a repo path and optional position.

```json
{
  "repo": "string (required)",
  "path": "string (required)",
  "line": "number (1-indexed)",
  "column": "number (1-indexed)"
}
```

## Installation (Optional)

If you prefer installing globally:

```bash
bun install -g dolphin-mcp
```

Then use `dolphin-mcp` instead of `bunx dolphin-mcp`.

## Requirements

- **Bun** >= 1.0.0 - [Install](https://bun.sh/install)
- **Dolphin API** running on configured endpoint

## License

MIT - see [LICENSE](LICENSE) file for details.

## Links

- [NPM Package](https://www.npmjs.com/package/dolphin-mcp)
- [GitHub Repository](https://github.com/tdc93/dolphin-mcp)
- [MCP Specification](https://modelcontextprotocol.io)