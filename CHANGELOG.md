# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-11-12

### Added

#### 🛠️ New File System Tools

- **`file_write`** - Write content to files with atomic operation and optional backup
  - Automatic parent directory creation
  - Optional backup before overwriting
  - Atomic write operations for data integrity
  - Configurable backup behavior

- **`read_files`** - Batch file reading with partial failure handling
  - Read multiple files in a single request (up to 50 files)
  - Configurable max file size (default: 1MB per file)
  - Partial failure support (continue on error or fail-fast)
  - Efficient bulk operations

#### 🧠 Context Enrichment & Intelligence

- **Graph-based code intelligence** integration
  - Support for `include_graph_context` parameter in search queries
  - Entity relationship enrichment (calls, imports, inheritance)
  - Cross-file dependency context
  - Enhanced search results with structural understanding

- **Context line expansion**
  - `context_lines_before` and `context_lines_after` parameters
  - Configurable context window (0-10 lines)
  - Better code comprehension with surrounding context
  - Maintains performance with bounded expansion

#### 🔧 Enhanced Search Capabilities

- **JSON-RPC protocol support** (in addition to MCP stdio)
  - Enables integration with more AI platforms
  - Standardized request/response format
  - Better error handling and structured responses
  - Backward compatible with existing MCP stdio clients

- **Advanced search parameters**
  - `exclude_paths` - Filter out specific file paths from results
  - `exclude_patterns` - Pattern-based exclusion (glob patterns)
  - `mmr_enabled` - Toggle Maximal Marginal Relevance
  - `mmr_lambda` - Configure MMR diversity parameter (0-1)
  - `score_cutoff` - Minimum relevance threshold
  - `deadline_ms` - Per-query timeout configuration

- **Embedding model selection**
  - `embed_model` parameter: "small" (1536d) or "large" (3072d)
  - Dynamic model selection per query
  - Backward compatible with default model

#### 📊 Improved Observability

- **Enhanced logging and debugging**
  - Structured JSONL logging for all tool operations
  - Request/response tracking with correlation IDs
  - Performance metrics for each tool call
  - Error context and stack traces

### Changed

- **Breaking**: Minimum required kb API version is now 1.0.0
- **Tool response format** now includes graph context when available
- **Search results** enriched with entity relationships
- **Error messages** more detailed with actionable remediation steps

### Improved

- **Performance optimizations** for batch operations
- **Memory efficiency** in file reading operations
- **Concurrent request handling** for multiple tool calls
- **Type safety** with enhanced Zod schemas

### Documentation

- Updated tool schemas with new parameters
- Added examples for file system operations
- Documented graph context integration
- Enhanced error handling guide

---

## [0.1.3] - 2025-11-08

### Fixed

- **Snippet visibility**: Removed pre-filtering logic that excluded snippets longer than 500 characters from resource blocks
- Snippets are now always included in search results, with intelligent trimming only applied when payload cap is exceeded

### Changed

- **Payload capacity increased** from 50KB to 70KB for richer search result context
- **Snippet size limits doubled**:
  - Initial cap: 500 → 1000 characters
  - Shrunk cap: 300 → 600 characters
  - Minimum floor: 200 → 300 characters
- Improved snippet context preservation while maintaining graceful degradation under payload constraints

## [0.1.2] - 2025-11-08

### Fixed

- Fixed bugs related to snippet fetching

### Changed

- **REST client configuration** now reads `KB_REST_BASE_URL` dynamically to support test mocking while maintaining production behavior

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
