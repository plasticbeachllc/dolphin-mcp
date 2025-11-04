import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { startMockRest } from './mockServer.js'
import { makeGetMetadata } from '../mcp/tools/get_metadata.js'
import { initLogger } from '../util/logger.js'

let stop: () => Promise<void>

beforeAll(async () => { 
  await initLogger(); 
  stop = await startMockRest(7777) 
})
afterAll(async () => { 
  await stop?.() 
})

describe('get_metadata', () => {
  it('returns metadata subset without content', async () => {
    const { handler } = makeGetMetadata()
    const res = await handler({ input: { chunk_id: '1' } })
    
    expect(res.isError).toBe(false)
    expect(res.data.chunk_id).toBe('1')
    expect(res.data.content).toBeUndefined()
    // Should include other metadata fields
    expect(res.data.repo).toBeDefined()
    expect(res.data.path).toBeDefined()
    expect(res.data.start_line).toBeDefined()
    expect(res.data.end_line).toBeDefined()
    expect(res.data.lang).toBeDefined()
  })

  it('chunk_not_found → isError=true with remediation', async () => {
    const { handler } = makeGetMetadata()
    const res = await handler({ input: { chunk_id: 'not-found' } })
    
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/remediation/i)
    expect(res.content[0].text).toMatch(/chunk/i)
  })

  it('tool definition includes valid JSON Schema', async () => {
    const { definition } = makeGetMetadata()
    
    expect(definition.inputSchema).toBeDefined()
    expect(definition.inputSchema.type).toBe('object')
    expect(definition.inputSchema.required).toContain('chunk_id')
    expect(definition.inputSchema.properties).toBeDefined()
    expect(definition.inputSchema.properties.chunk_id).toBeDefined()
  })
})
