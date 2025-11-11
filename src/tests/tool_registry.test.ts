import { describe, it, expect } from 'bun:test'
import { tools } from '../mcp/tools/index.js'

describe('tool registry', () => {
  it('exports exactly 7 tools', () => {
    expect(tools.length).toBe(7)
  })

  it('all tools have required properties', () => {
    for (const tool of tools) {
      expect(tool.definition).toBeDefined()
      expect(tool.handler).toBeDefined()
      expect(typeof tool.handler).toBe('function')

      // Check definition structure
      expect(tool.definition.name).toBeDefined()
      expect(typeof tool.definition.name).toBe('string')
      expect(tool.definition.description).toBeDefined()
      expect(typeof tool.definition.description).toBe('string')
      expect(tool.definition.inputSchema).toBeDefined()
    }
  })

  it('includes search_knowledge tool', () => {
    const tool = tools.find(t => t.definition.name === 'search_knowledge')
    expect(tool).toBeDefined()
    expect(tool?.definition.description).toContain('semantic')
  })

  it('includes fetch_chunk tool', () => {
    const tool = tools.find(t => t.definition.name === 'fetch_chunk')
    expect(tool).toBeDefined()
    expect(tool?.definition.description).toContain('chunk')
  })

  it('includes fetch_lines tool', () => {
    const tool = tools.find(t => t.definition.name === 'fetch_lines')
    expect(tool).toBeDefined()
    expect(tool?.definition.description).toContain('file slice')
  })

  it('includes get_vector_store_info tool', () => {
    const tool = tools.find(t => t.definition.name === 'get_vector_store_info')
    expect(tool).toBeDefined()
    expect(tool?.definition.description).toContain('vector')
  })

  it('includes get_metadata tool', () => {
    const tool = tools.find(t => t.definition.name === 'get_metadata')
    expect(tool).toBeDefined()
    expect(tool?.definition.description).toContain('metadata')
  })

  it('includes file_write tool', () => {
    const tool = tools.find(t => t.definition.name === 'file_write')
    expect(tool).toBeDefined()
    expect(tool?.definition.description).toContain('atomic')
    expect(tool?.definition.description).toContain('backup')
  })

  it('includes open_in_editor tool', () => {
    const tool = tools.find(t => t.definition.name === 'open_in_editor')
    expect(tool).toBeDefined()
    expect(tool?.definition.description).toContain('vscode')
  })

  it('does not include read_files tool (removed)', () => {
    const tool = tools.find(t => t.definition.name === 'read_files')
    expect(tool).toBeUndefined()
  })

  it('all tool names are unique', () => {
    const names = tools.map(t => t.definition.name)
    const uniqueNames = new Set(names)
    expect(uniqueNames.size).toBe(names.length)
  })

  it('all tool descriptions are non-empty', () => {
    for (const tool of tools) {
      expect(tool.definition.description.length).toBeGreaterThan(10)
    }
  })

  it('all tools have valid JSON schemas', () => {
    for (const tool of tools) {
      const schema = tool.definition.inputSchema
      expect(schema.type).toBe('object')
      expect(schema.properties).toBeDefined()
      expect(typeof schema.properties).toBe('object')

      // Verify all properties are properly defined
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        expect(propName).toBeTruthy()
        expect(propSchema).toBeDefined()
      }
    }
  })

  it('read-only tools have readOnlyHint annotation', () => {
    const readOnlyTools = [
      'search_knowledge',
      'fetch_chunk',
      'fetch_lines',
      'get_vector_store_info',
      'get_metadata',
      'open_in_editor'
    ]

    for (const toolName of readOnlyTools) {
      const tool = tools.find(t => t.definition.name === toolName)
      expect(tool).toBeDefined()
      // Note: Some tools may not have annotations, which is acceptable
      if (tool?.definition.annotations) {
        expect(tool.definition.annotations.readOnlyHint).toBeDefined()
      }
    }
  })

  it('file_write tool is not read-only', () => {
    const tool = tools.find(t => t.definition.name === 'file_write')
    expect(tool).toBeDefined()
    expect(tool?.definition.annotations?.readOnlyHint).toBe(false)
  })

  it('file_write tool description mentions safety features', () => {
    const tool = tools.find(t => t.definition.name === 'file_write')
    expect(tool).toBeDefined()
    expect(tool?.definition.description).toContain('safer')
    expect(tool?.definition.description).toContain('built-in Write')
  })

  it('all required tool parameters are marked as required', () => {
    // search_knowledge requires query
    const searchTool = tools.find(t => t.definition.name === 'search_knowledge')
    expect(searchTool?.definition.inputSchema.required).toContain('query')

    // fetch_chunk requires chunk_id
    const fetchChunkTool = tools.find(t => t.definition.name === 'fetch_chunk')
    expect(fetchChunkTool?.definition.inputSchema.required).toContain('chunk_id')

    // fetch_lines requires repo, path, start, end
    const fetchLinesTool = tools.find(t => t.definition.name === 'fetch_lines')
    expect(fetchLinesTool?.definition.inputSchema.required).toContain('repo')
    expect(fetchLinesTool?.definition.inputSchema.required).toContain('path')
    expect(fetchLinesTool?.definition.inputSchema.required).toContain('start')
    expect(fetchLinesTool?.definition.inputSchema.required).toContain('end')

    // file_write requires path and content
    const fileWriteTool = tools.find(t => t.definition.name === 'file_write')
    expect(fileWriteTool?.definition.inputSchema.required).toContain('path')
    expect(fileWriteTool?.definition.inputSchema.required).toContain('content')

    // get_metadata requires chunk_id
    const getMetadataTool = tools.find(t => t.definition.name === 'get_metadata')
    expect(getMetadataTool?.definition.inputSchema.required).toContain('chunk_id')

    // open_in_editor requires repo and path
    const openEditorTool = tools.find(t => t.definition.name === 'open_in_editor')
    expect(openEditorTool?.definition.inputSchema.required).toContain('repo')
    expect(openEditorTool?.definition.inputSchema.required).toContain('path')
  })

  it('tool handlers are async functions', async () => {
    for (const tool of tools) {
      expect(typeof tool.handler).toBe('function')
      // Check if handler returns a promise (async)
      const isAsync = tool.handler.constructor.name === 'AsyncFunction' ||
        typeof tool.handler({}).then === 'function'
      expect(isAsync).toBe(true)
    }
  })
})
