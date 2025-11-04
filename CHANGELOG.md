# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-11-04

### Added
- **Parallel snippet fetching** with configurable concurrency for `search_knowledge` tool
- Configuration options for concurrency control:
  - `MAX_CONCURRENT_SNIPPET_FETCH` (default: 8, range: 1-12)
  - `SNIPPET_FETCH_TIMEOUT_MS` (default: 2000ms, range: 500-10000ms)
  - `SNIPPET_FETCH_RETRY_ATTEMPTS` (default: 1, range: 0-3)

### Improved
- Test coverage for concurrency features (400+ lines of tests)
- Error handling in parallel snippet fetching with graceful degradation
- Memory leak prevention with proper cleanup of event listeners and timeouts
- Configuration validation with bounds checking

## [0.1.0] - 2025-11-03

### Added
- Initial release of dolphin-mcp
- MCP server implementation for Dolphin semantic code search
- Tools:
  - `search_knowledge` - Semantic search across indexed repositories
  - `fetch_chunk` - Fetch code chunks by ID
  - `fetch_lines` - Fetch file slices by line range
  - `get_vector_store_info` - Repository metadata
  - `get_metadata` - Chunk metadata
  - `open_in_editor` - Generate VS Code URIs
- Support for Continue.dev and Claude Desktop
- JSONL logging to `logs/mcp.log`
- 50KB payload cap with intelligent truncation
- Environment variable configuration
- Comprehensive test suite
