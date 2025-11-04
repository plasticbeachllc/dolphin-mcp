import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { startMockRest } from './mockServer.js'
import { makeFetchChunk } from '../mcp/tools/fetch_chunk.js'
import { initLogger } from '../util/logger.js'

let stop: () => Promise<void>

beforeAll(async () => { 
  await initLogger(); 
  stop = await startMockRest(7777) 
})
afterAll(async () => { 
  await stop?.() 
})

describe('fetch_chunk', () => {
  it('happy path: returns chunk info with citation and data payload', async () => {
    const { handler } = makeFetchChunk()
    const res = await handler({ input: { chunk_id: '1' } })
    
    expect(res.isError).toBe(false)
    expect(res.data).toBeDefined()
    expect(res.data.chunk_id).toBe('1')
    expect(res.data.resource_link).toContain('kb://')
    
    // Check content structure
    expect(Array.isArray(res.content)).toBe(true)
    expect(res.content.length).toBeGreaterThan(0)
    expect(res.content[0].type).toBe('text')
    expect(res.content[0].text).toContain('Chunk 1')
    expect(res.content[0].text).toContain('repoa/src/a.ts')
    
    // Check resource block exists with code content
    const resourceBlock = res.content.find(c => c.type === 'resource')
    expect(resourceBlock).toBeDefined()
    expect(resourceBlock?.resource?.uri).toContain('kb://')
    expect(resourceBlock?.resource?.text).toBeDefined()
  })

  it('chunk_not_found → isError=true with remediation', async () => {
    const { handler } = makeFetchChunk()
    const res = await handler({ input: { chunk_id: 'not-found' } })
    
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/remediation/i)
    expect(res.content[0].text).toMatch(/chunk/i)
  })

  it('includes citation URI in resource block', async () => {
    const { handler } = makeFetchChunk()
    const res = await handler({ input: { chunk_id: '1' } })
    
    expect(res.isError).toBe(false)
    // Check that the resource block includes the citation URI
    const resourceBlock = res.content.find(c => c.type === 'resource')
    expect(resourceBlock?.resource?.uri).toContain('kb://')
  })

  it('tool definition includes valid JSON Schema', async () => {
    const { definition } = makeFetchChunk()
    
    expect(definition.inputSchema).toBeDefined()
    expect(definition.inputSchema.type).toBe('object')
    expect(definition.inputSchema.required).toContain('chunk_id')
    expect(definition.inputSchema.properties).toBeDefined()
    expect(definition.inputSchema.properties.chunk_id).toBeDefined()
  })
})
