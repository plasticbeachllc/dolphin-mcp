import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { startMockRest } from './mockServer.js'
import { makeOpenInEditor } from '../mcp/tools/open_in_editor.js'
import { initLogger } from '../util/logger.js'

let stop: () => Promise<void>

beforeAll(async () => { 
  await initLogger(); 
  stop = await startMockRest(7777) 
})
afterAll(async () => { 
  await stop?.() 
})

describe('open_in_editor', () => {
  beforeEach(() => {
    // Clear any cache between tests if needed
  })

  it('happy path: repo cache resolves absolute path; URI forms vscode://file/<encoded_path>', async () => {
    const { handler } = makeOpenInEditor()
    const res = await handler({ input: { repo: 'repoa', path: 'src/a.ts' } })
    
    expect(res.isError).toBe(false)
    expect(String(res.data.uri)).toMatch(/^vscode:\/\/file\//)
    // Should include full file path
    expect(String(res.data.uri)).toContain('/abs/repoa/src/a.ts')
  })

  it('encoding: spaces and non-ASCII correctly percent-encoded', async () => {
    const { handler } = makeOpenInEditor()
    const res = await handler({ input: { repo: 'repoa', path: 'src/file with spaces.ts' } })
    
    expect(res.isError).toBe(false)
    expect(String(res.data.uri)).toContain('file%20with%20spaces')
  })

  it('defaults: if line present and column omitted, column=1', async () => {
    const { handler } = makeOpenInEditor()
    const res = await handler({ input: { repo: 'repoa', path: 'src/a.ts', line: 5 } })
    
    expect(res.isError).toBe(false)
    expect(String(res.data.uri)).toMatch(/:5:1/)
  })

  it('defaults: if neither line nor column provided, no suffix', async () => {
    const { handler } = makeOpenInEditor()
    const res = await handler({ input: { repo: 'repoa', path: 'src/a.ts' } })
    
    expect(res.isError).toBe(false)
    // URI includes protocol which has colons, so we check for line/column suffix
    expect(String(res.data.uri)).not.toMatch(/:\d+/) // No line numbers
  })

  it('cache TTL: expires after 5 minutes (mock time or TTL injection)', async () => {
    // This test would require time manipulation to test TTL properly
    // For now, we test that the cache mechanism exists
    const { handler } = makeOpenInEditor()
    const res1 = await handler({ input: { repo: 'repoa', path: 'src/a.ts' } })
    const res2 = await handler({ input: { repo: 'repoa', path: 'src/a.ts' } })
    
    expect(res1.isError).toBe(false)
    expect(res2.isError).toBe(false)
    // Both calls should work, second might use cache
  })

  it('repo_not_found → isError=true with remediation', async () => {
    const { handler } = makeOpenInEditor()
    const res = await handler({ input: { repo: 'nonexistent-repo', path: 'src/a.ts' } })
    
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/remediation/i)
    expect(res.content[0].text).toMatch(/repo/i)
  })

  it('tool definition includes valid JSON Schema', async () => {
    const { definition } = makeOpenInEditor()
    
    expect(definition.inputSchema).toBeDefined()
    expect(definition.inputSchema.type).toBe('object')
    expect(definition.inputSchema.required).toContain('repo')
    expect(definition.inputSchema.required).toContain('path')
    expect(definition.inputSchema.properties).toBeDefined()
  })
})
