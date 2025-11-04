# dolphin-mcp

[![NPM Version](https://img.shields.io/npm/v/@plastic-beach/dolphin-mcp.svg)](https://www.npmjs.com/package/@plastic-beach/dolphin-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun->=1.0.0-orange.svg)](https://bun.sh)

A Model Context Protocol (MCP) server that provides Dolphin semantic code search capabilities to AI applications like Continue.dev, Claude Desktop, and other MCP-compatible clients.

## 🛠️ Installation

### Prerequisites

- **Bun** (>= 1.0.0): [Install Bun](https://bun.sh/install)
- **Dolphin API Server**: Running on your specified endpoint

### Install the MCP Server

```bash
# Install globally
bun install -g @plastic-beach/dolphin-mcp

# Or install locally in your project
bun install @plastic-beach/dolphin-mcp
```

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOLPHIN_API_URL` | No | `http://127.0.0.1:7777` | Dolphin API endpoint |
| `KB_REST_BASE_URL` | No | - | Alternative for DOLPHIN_API_URL |
| `LOG_LEVEL` | No | `info` | Logging level (debug, info, warn, error) |
| `SERVER_NAME` | No | `dolphin-mcp` | Server identifier |
| `SERVER_VERSION` | No | `0.1.0` | Server version |

### Quick Setup

```bash
# Test the server
bunx @plastic-beach/dolphin-mcp
```

## 📱 AI Application Integration

### Continue.dev Configuration

Add this to your `config.yaml`:

```yaml
mcpServers:
  - name: Dolphin-KB
    command: dolphin-mcp
    env:
      DOLPHIN_API_URL: "http://127.0.0.1:7777"
    connectionTimeout: 30000
```

### Claude Desktop Configuration

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dolphin-kb": {
      "command": "dolphin-mcp",
      "env": {
        "DOLPHIN_API_URL": "http://127.0.0.1:7777"
      }
    }
  }
}
```

### Direct Usage

```bash
# Start the MCP server directly
dolphin-mcp
```

## 🧰 Available Tools

The Dolphin MCP server provides these tools to AI applications:

### 1. search_knowledge
Search codebase semantically using AI embeddings.

**Parameters:**
- `query` (string): Search query - **Required**
- `repos` (string[]): Optional repository filters
- `top_k` (number): Number of results (default: 8)

### 2. fetch_chunk
Get detailed chunk content by ID.

**Parameters:**
- `chunk_id` (string): Chunk identifier - **Required**

### 3. fetch_lines
Get specific file lines by range.

**Parameters:**
- `repo` (string): Repository name - **Required**
- `path` (string): File path - **Required**
- `start` (number): Start line (1-indexed) - **Required**
- `end` (number): End line (inclusive) - **Required**

### 4. get_vector_store_info
Get knowledge base statistics and repository info.

**Parameters:** None

### 5. open_in_editor
Generate VS Code URI for opening files.

**Parameters:**
- `repo` (string): Repository name - **Required**
- `path` (string): File path - **Required**
- `start_line` (number): Start line (default: 1)

## 🔧 Development

### Prerequisites

- Bun (>= 1.0.0)
- TypeScript
- Node.js 18+

### Project Structure

```
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── index.ts            # Development entry
│   ├── mcp/
│   │   ├── server.ts       # MCP server implementation
│   │   └── tools/          # MCP tool definitions
│   ├── rest/
│   │   └── client.ts       # REST API client
│   └── util/               # Utilities
├── dist/                   # Built files
├── tests/                  # Test suites
└── README.md
```

## 📋 Requirements

- **Bun**: >= 1.0.0
- **Node.js**: 18+
- **Dolphin API Server**: Accessible via HTTP/HTTPS

## 🐛 Troubleshooting

### Common Issues

**Server fails to start:**
```bash
# Check if Dolphin API is accessible
curl http://127.0.0.1:7777/health
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **NPM Package**: https://www.npmjs.com/package/@plastic-beach/dolphin-mcp
- **GitHub Repository**: https://github.com/plasticbeachllc/dolphin-mcp
- **MCP Specification**: https://modelcontextprotocol.io
- **Continue.dev**: https://continue.dev

## ⚡ Quick Start Commands

```bash
# Install
bun install -g @plastic-beach/dolphin-mcp

# Configure
export DOLPHIN_API_URL="http://127.0.0.1:7777"

# Start server
dolphin-mcp

# Test in terminal
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | dolphin-mcp
