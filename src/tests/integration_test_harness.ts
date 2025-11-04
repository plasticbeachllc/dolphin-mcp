#!/usr/bin/env bun

// Integration test harness for MCP Bridge with real REST retriever
// Usage: Run the FastAPI retriever on 127.0.0.1:7777 first, then run this script

import { makeSearchKnowledge } from '../mcp/tools/search_knowledge.js'
import { makeFetchChunk } from '../mcp/tools/fetch_chunk.js'
import { makeFetchLines } from '../mcp/tools/fetch_lines.js'
import { makeOpenInEditor } from '../mcp/tools/open_in_editor.js'
import { makeGetVectorStoreInfo } from '../mcp/tools/get_vector_store_info.js'
import { makeGetMetadata } from '../mcp/tools/get_metadata.js'
import { initLogger } from '../util/logger.js'

async function runIntegrationTests() {
  console.log('🚀 Starting MCP Bridge Integration Tests...\n')
  
  await initLogger()
  
  const tests = [
    {
      name: 'search_knowledge - smoke test',
      tool: makeSearchKnowledge(),
      input: { query: 'test' }
    },
    {
      name: 'fetch_chunk - smoke test',
      tool: makeFetchChunk(),
      input: { chunk_id: '1' }
    },
    {
      name: 'fetch_lines - smoke test',
      tool: makeFetchLines(),
      input: { repo: 'repoa', path: 'src/a.ts', start: 1, end: 10 }
    },
    {
      name: 'open_in_editor - smoke test',
      tool: makeOpenInEditor(),
      input: { repo: 'repoa', path: 'src/a.ts' }
    },
    {
      name: 'get_vector_store_info - smoke test',
      tool: makeGetVectorStoreInfo(),
      input: {}
    },
    {
      name: 'get_metadata - smoke test',
      tool: makeGetMetadata(),
      input: { chunk_id: '1' }
    }
  ]
  
  let passed = 0
  let failed = 0
  
  for (const test of tests) {
    console.log(`📋 Running: ${test.name}`)
    
    try {
      const startTime = Date.now()
      const result = await test.tool.handler({ input: test.input })
      const latency = Date.now() - startTime
      
      if (result.isError) {
        console.log(`  ❌ FAILED: ${result.content[0]?.text || 'Unknown error'}`)
        failed++
      } else {
        console.log(`  ✅ PASSED (${latency}ms)`)
        
        // Log some details for successful tests
        if (test.name.includes('search_knowledge')) {
          console.log(`    Found ${result._meta?.hits?.length || 0} hits`)
        } else if (test.name.includes('fetch_chunk') || test.name.includes('fetch_lines')) {
          console.log(`    Content length: ${result.content[0]?.text?.length || 0} chars`)
        } else if (test.name.includes('open_in_editor')) {
          console.log(`    URI: ${result.data?.uri}`)
        }
        
        passed++
      }
    } catch (error) {
      console.log(`  ❌ ERROR: ${error.message}`)
      failed++
    }
    
    console.log('') // Empty line for readability
  }
  
  // Test pagination with multiple calls
  console.log('📋 Running: search_knowledge - pagination test')
  try {
    const { handler } = makeSearchKnowledge()
    const firstPage = await handler({ input: { query: 'test', top_k: 2 } })
    
    if (firstPage.isError) {
      console.log(`  ❌ First page failed: ${firstPage.content[0]?.text}`)
      failed++
    } else if (firstPage._meta?.cursor) {
      const secondPage = await handler({ 
        input: { 
          query: 'test', 
          top_k: 2, 
          cursor: firstPage._meta.cursor 
        } 
      })
      
      if (secondPage.isError) {
        console.log(`  ❌ Second page failed: ${secondPage.content[0]?.text}`)
        failed++
      } else {
        console.log('  ✅ Pagination test passed')
        passed++
      }
    } else {
      console.log('  ⚠️  No cursor for pagination test (expected if no more results)')
      passed++ // Not a failure, just no pagination needed
    }
  } catch (error) {
    console.log(`  ❌ Pagination error: ${error.message}`)
    failed++
  }
  
  console.log('\n📊 Test Summary:')
  console.log(`   ✅ Passed: ${passed}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`)
  
  if (failed > 0) {
    console.log('\n❌ Some integration tests failed. Make sure the REST retriever is running on 127.0.0.1:7777')
    process.exit(1)
  } else {
    console.log('\n🎉 All integration tests passed!')
    process.exit(0)
  }
}

// Check if REST server is available before running tests
async function checkRestServer() {
  try {
    const response = await fetch('http://127.0.0.1:7777/v1/health')
    return response.ok
  } catch {
    return false
  }
}

// Main execution
async function main() {
  const serverAvailable = await checkRestServer()
  
  if (!serverAvailable) {
    console.log('❌ REST retriever not found at http://127.0.0.1:7777')
    console.log('   Please start the FastAPI retriever first, then run this script.')
    console.log('   Example command: uvicorn main:app --host 127.0.0.1 --port 7777')
    process.exit(1)
  }
  
  await runIntegrationTests()
}

main().catch(console.error)