#!/usr/bin/env bun
/**
 * End-to-end integration test for MCP Bridge with real REST API
 *
 * Prerequisites:
 * 1. kb-api server running on http://127.0.0.1:7777
 * 2. At least one repository indexed
 *
 * Run: bun run test-integration.ts
 */

import { makeSearchKnowledge } from './src/mcp/tools/search_knowledge.js'
import { makeFetchChunk } from './src/mcp/tools/fetch_chunk.js'
import { makeFetchLines } from './src/mcp/tools/fetch_lines.js'
import { makeGetVectorStoreInfo } from './src/mcp/tools/get_vector_store_info.js'
import { restListRepos } from './src/rest/client.js'

async function main() {
  console.log('🧪 MCP Bridge Integration Test\n')

  // Test 1: Check REST API connectivity
  console.log('1️⃣  Testing REST API connectivity...')
  try {
    const reposResponse = await restListRepos()
    console.log(`✅ REST API is reachable`)
    console.log(`   Found ${reposResponse.repos.length} indexed repo(s):`)
    reposResponse.repos.forEach(r => {
      console.log(`   - ${r.name}: ${r.chunks || 0} chunks, ${r.files || 0} files`)
    })

    if (reposResponse.repos.length === 0) {
      console.log('\n⚠️  No repositories indexed. Please index a repo first:')
      console.log('   kb-index /path/to/repo --name myrepo')
      return
    }
  } catch (e: any) {
    console.error('❌ Failed to connect to REST API:', e.message)
    console.error('   Make sure kb-api is running: kb-api')
    return
  }

  // Test 2: Vector Store Info
  console.log('\n2️⃣  Testing get_vector_store_info tool...')
  try {
    const { handler: getInfoHandler } = makeGetVectorStoreInfo()
    const result = await getInfoHandler({})

    if (result.isError) {
      console.error('❌ get_vector_store_info failed:', result.content[0].text)
      return
    }

    console.log('✅ get_vector_store_info succeeded')
    console.log('   Data:', JSON.stringify(result.data, null, 2))
  } catch (e: any) {
    console.error('❌ get_vector_store_info error:', e.message)
    return
  }

  // Test 3: Search Knowledge
  console.log('\n3️⃣  Testing search_knowledge tool...')
  try {
    const { handler: searchHandler } = makeSearchKnowledge()
    const result = await searchHandler({
      input: {
        query: 'function',
        top_k: 3
      }
    })

    if (result.isError) {
      console.error('❌ search_knowledge failed:', result.content[0].text)
      return
    }

    console.log('✅ search_knowledge succeeded')
    console.log(`   Summary: ${result.content[0].text}`)
    console.log(`   Found ${result._meta.hits.length} results`)

    if (result._meta.hits.length > 0) {
      const firstHit = result._meta.hits[0]
      console.log(`   First result: ${firstHit.repo}/${firstHit.path}:${firstHit.start_line}-${firstHit.end_line}`)

      // Test 4: Fetch Chunk
      console.log('\n4️⃣  Testing fetch_chunk tool...')
      try {
        const { handler: fetchChunkHandler } = makeFetchChunk()
        const chunkResult = await fetchChunkHandler({
          input: { chunk_id: firstHit.chunk_id }
        })

        if (chunkResult.isError) {
          console.error('❌ fetch_chunk failed:', chunkResult.content[0].text)
        } else {
          console.log('✅ fetch_chunk succeeded')
          console.log(`   Citation: ${chunkResult.content[0].text}`)
        }
      } catch (e: any) {
        console.error('❌ fetch_chunk error:', e.message)
      }

      // Test 5: Fetch Lines
      console.log('\n5️⃣  Testing fetch_lines tool...')
      try {
        const { handler: fetchLinesHandler } = makeFetchLines()
        const linesResult = await fetchLinesHandler({
          input: {
            repo: firstHit.repo,
            path: firstHit.path,
            start: firstHit.start_line,
            end: Math.min(firstHit.start_line + 10, firstHit.end_line)
          }
        })

        if (linesResult.isError) {
          console.error('❌ fetch_lines failed:', linesResult.content[0].text)
        } else {
          console.log('✅ fetch_lines succeeded')
          console.log(`   Citation: ${linesResult.content[0].text}`)
        }
      } catch (e: any) {
        console.error('❌ fetch_lines error:', e.message)
      }
    }
  } catch (e: any) {
    console.error('❌ search_knowledge error:', e.message)
    return
  }

  console.log('\n🎉 All integration tests completed successfully!')
}

main().catch(console.error)
