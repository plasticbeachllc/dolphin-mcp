import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

// Enhanced mock REST server for comprehensive unit tests
export function startMockRest (port = 7777): Promise<() => Promise<void>> {
  let repoCache = {
    repos: [
      { name: 'repoa', path: '/abs/repoa', default_embed_model: 'small', files: 1, chunks: 2 },
      { name: 'repob', path: '/abs/repob', default_embed_model: 'large', files: 3, chunks: 5 }
    ]
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '', `http://127.0.0.1:${port}`)
      
      // GET /repos (supports /v1 and unversioned)
      if (req.method === 'GET' && (url.pathname === '/v1/repos' || url.pathname === '/repos')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(repoCache))
        return
      }

      // GET /chunks/{id} (supports /v1 and unversioned)
      if (req.method === 'GET' && (url.pathname.startsWith('/v1/chunks/') || url.pathname.startsWith('/chunks/'))) {
        const id = url.pathname.split('/').pop()
        
        // Simulate chunk not found
        if (id === 'not-found') {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'chunk_not_found', message: 'Chunk not found' } }))
          return
        }
        
        const body = {
          chunk_id: id,
          repo: 'repoa',
          path: 'src/a.ts',
          lang: 'typescript',
          start_line: 1,
          end_line: 10,
          content: 'export const a = 1;\n// Some code here\nfunction test() {}\n',
          resource_link: 'kb://repoa/src/a.ts#L1-L10'
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(body))
        return
      }

      // GET /file (supports /v1 and unversioned)
      if (req.method === 'GET' && (url.pathname === '/v1/file' || url.pathname === '/file')) {
        const path = url.searchParams.get('path') ?? 'src/a.ts'
        const start = Number(url.searchParams.get('start') ?? '1')
        const end = Number(url.searchParams.get('end') ?? '10')
        const repo = url.searchParams.get('repo') ?? 'repoa'
        
        // Simulate file not found
        if (path === 'nonexistent.ts') {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'file_not_found', message: 'File not found' } }))
          return
        }
        
        // Simulate invalid range
        if (start > end) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'invalid_range', message: 'Invalid line range' } }))
          return
        }
        
        const body = {
          repo,
          path,
          start_line: start,
          end_line: end,
          content: `// Lines ${start}-${end}\nconst content = 'slice';`,
          lang: path.endsWith('.ts') ? 'typescript' : path.endsWith('.py') ? 'python' : 'plain',
          source: 'disk'
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(body))
        return
      }

      // POST /search (supports /v1 and unversioned)
      if (req.method === 'POST' && (url.pathname === '/v1/search' || url.pathname === '/search')) {
        let raw = ''
        for await (const chunk of req) raw += chunk
        const body = JSON.parse(raw || '{}')
        const { query, repos, path_prefix, top_k, cursor, deadline_ms } = body
        
        // Simulate repo not found
        if (repos && repos.some((r: string) => r.trim() === 'nonexistent-repo')) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'repo_not_found', message: 'Repository not found' } }))
          return
        }
        
        // Simulate deadline exceeded (partial results)
        if (deadline_ms === 1) {
          const partialHits = [
            { repo: 'repoa', path: 'src/a.ts', lang: 'typescript', start_line: 1, end_line: 20, score: 0.9, snippet: 'export const a = 1', chunk_id: '1', resource_link: 'kb://repoa/src/a.ts#L1-L20' }
          ]
          const response = {
            hits: partialHits,
            meta: {
              top_k: top_k || 5,
              model: 'text-embedding-3-small',
              cursor: 'partial-cursor',
              estimated_total: 10,
              complete: false,
              warnings: ['deadline_exceeded']
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(response))
          return
        }
        
        // Simulate embeddings unavailable
        if (body.embed_model === 'unavailable') {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'embeddings_unavailable', message: 'Embeddings service unavailable' } }))
          return
        }
        
        // Generate hits based on query (include some out-of-scope noise to validate client-side post-filtering)
        let hits: any[] = []
        if (query) {
          if (typeof query === 'string' && query.toLowerCase().includes('ingestion')) {
            // Relevant ingestion-related hits
            hits.push(
              {
                repo: 'repoa',
                path: 'kb/ingest/pipeline.py',
                lang: 'python',
                start_line: 1,
                end_line: 40,
                score: 0.96,
                snippet: 'def run_pipeline(...):\n    pass',
                chunk_id: 'ing-1',
                resource_link: 'kb://repoa/kb/ingest/pipeline.py#L1-L40'
              },
              {
                repo: 'repoa',
                path: 'kb/chunkers/md_chunker.py',
                lang: 'python',
                start_line: 10,
                end_line: 80,
                score: 0.88,
                snippet: 'class MdChunker:\n    pass',
                chunk_id: 'ing-2',
                resource_link: 'kb://repoa/kb/chunkers/md_chunker.py#L10-L80'
              }
            )
            // Irrelevant persona/personas_config noise (should be filtered by client when path_prefix is provided)
            hits.push(
              {
                repo: 'repoa',
                path: '.continue/agents/personas_config.yaml',
                lang: 'yaml',
                start_line: 1,
                end_line: 200,
                score: 0.99,
                snippet: 'name: Dolphin Personas\nversion: 0.1.1\nschema: v1\nmodels:\n- name: Chief of Staff',
                chunk_id: 'noise-1',
                resource_link: 'kb://repoa/.continue/agents/personas_config.yaml#L1-L200'
              }
            )
          } else if (query === 'large-snippet') {
            hits = [
              {
                repo: 'repoa',
                path: 'src/a.ts',
                lang: 'typescript',
                start_line: 1,
                end_line: 20,
                score: 0.9,
                snippet: 'x'.repeat(600),
                chunk_id: '1',
                resource_link: 'kb://repoa/src/a.ts#L1-L20'
              }
            ]
          } else {
            hits = [
              {
                repo: 'repoa',
                path: 'src/a.ts',
                lang: 'typescript',
                start_line: 1,
                end_line: 20,
                score: 0.9,
                snippet: 'export const a = 1',
                chunk_id: '1',
                resource_link: 'kb://repoa/src/a.ts#L1-L20'
              },
              {
                repo: 'repob',
                path: 'src/b.py',
                lang: 'python',
                start_line: 5,
                end_line: 15,
                score: 0.8,
                snippet: 'def test_function():\n    return True',
                chunk_id: '2',
                resource_link: 'kb://repob/src/b.py#L5-L15'
              }
            ]
          }
        }
        
        const response = {
          hits,
          meta: {
            top_k: top_k || 5,
            model: body.embed_model || 'text-embedding-3-small',
            cursor: cursor || (hits.length ? 'opaque-cursor' : undefined),
            estimated_total: hits.length,
            complete: true,
            warnings: top_k && top_k > 100 ? ['top_k clamped to 100'] : []
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(response))
        return
      }

      // GET /v1/health (optional)
      if (req.method === 'GET' && url.pathname === '/v1/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'healthy', version: '0.1.0' }))
        return
      }

      res.statusCode = 404
      res.end(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }))
    } catch (e: any) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: { code: 'mock_error', message: e?.message ?? String(e) } }))
    }
  })

  return new Promise((resolve, reject) => {
    const onReady = () => {
      const addr = server.address()
      const actualPort = typeof addr === 'object' && addr !== null ? (addr as any).port : port
      // Point REST client to this mock server instance
      try {
        if (typeof process !== 'undefined' && process.env) {
          process.env.KB_REST_BASE_URL = `http://127.0.0.1:${actualPort}`
        }
      } catch {
        // ignore if env not available
      }
      resolve(async () => {
        // teardown: close server and clear override
        try {
          if (typeof process !== 'undefined' && process.env) {
            delete process.env.KB_REST_BASE_URL
          }
        } catch {
          // ignore
        }
        await new Promise(res => server.close(() => res(null)))
      })
    }

    const tryListen = (p: number) => {
      server.once('error', (err: any) => {
        // If requested port is busy, fall back to ephemeral port 0
        const code = err?.code || ''
        const msg = err?.message || ''
        if (p !== 0 && (code === 'EADDRINUSE' || /in use/i.test(msg))) {
          // retry with ephemeral port
          server.removeAllListeners('error')
          tryListen(0)
          return
        }
        reject(err)
      })
      server.listen(p, '127.0.0.1', onReady)
    }

    tryListen(port)
  })
}
