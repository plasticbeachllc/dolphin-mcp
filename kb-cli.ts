#!/usr/bin/env bun
/**
 * Simple CLI wrapper for KB MCP tools
 *
 * Usage:
 *   bun run kb-cli.ts search "query text"
 *   bun run kb-cli.ts repos
 *   bun run kb-cli.ts chunk <chunk-id>
 *   bun run kb-cli.ts lines <repo> <path> <start> <end>
 */

import { makeSearchKnowledge } from "./src/mcp/tools/search_knowledge.js";
import { makeFetchChunk } from "./src/mcp/tools/fetch_chunk.js";
import { makeFetchLines } from "./src/mcp/tools/fetch_lines.js";
import { makeGetVectorStoreInfo } from "./src/mcp/tools/get_vector_store_info.js";
import { restListRepos } from "./src/rest/client.js";

const [, , command, ...args] = process.argv;

async function main() {
  try {
    switch (command) {
      case "search": {
        const query = args.join(" ");
        if (!query) {
          console.error("Usage: kb-cli.ts search <query>");
          process.exit(1);
        }

        const topK = process.env.KB_TOP_K ? parseInt(process.env.KB_TOP_K) : 5;
        const repos = process.env.KB_REPOS ? process.env.KB_REPOS.split(",") : undefined;

        console.log(`🔍 Searching for: "${query}"`);
        if (repos) console.log(`   Repos: ${repos.join(", ")}`);
        console.log();

        const { handler } = makeSearchKnowledge();
        const result = await handler({
          input: {
            query,
            top_k: topK,
            repos,
          },
        });

        if (result.isError) {
          console.error("❌ Search failed:", result.content[0].text);
          process.exit(1);
        }

        console.log(result.content[0].text); // Summary
        console.log();

        // Show results
        const hits = result._meta.hits;
        if (hits.length > 0) {
          console.log("Results:");
          hits.forEach((hit: any, i: number) => {
            console.log(`\n${i + 1}. [${hit.repo}] ${hit.path}:${hit.start_line}-${hit.end_line}`);
            console.log(`   Score: ${hit.score.toFixed(3)}`);
            console.log(`   Chunk ID: ${hit.chunk_id}`);
          });
        }
        break;
      }

      case "repos": {
        console.log("📚 Indexed Repositories:\n");

        const repos = await restListRepos();

        if (repos.repos.length === 0) {
          console.log("No repositories indexed.");
          console.log("\nTo index a repository:");
          console.log("  kb-index /path/to/repo --name repo-name");
          process.exit(0);
        }

        repos.repos.forEach((repo) => {
          console.log(`• ${repo.name}`);
          console.log(`  Path: ${repo.path}`);
          console.log(`  Files: ${repo.files || 0}`);
          console.log(`  Chunks: ${repo.chunks || 0}`);
          console.log(`  Model: ${repo.default_embed_model || "small"}`);
          console.log();
        });
        break;
      }

      case "chunk": {
        const chunkId = args[0];
        if (!chunkId) {
          console.error("Usage: kb-cli.ts chunk <chunk-id>");
          process.exit(1);
        }

        console.log(`📦 Fetching chunk: ${chunkId}\n`);

        const { handler } = makeFetchChunk();
        const result = await handler({ input: { chunk_id: chunkId } });

        if (result.isError) {
          console.error("❌ Fetch failed:", result.content[0].text);
          process.exit(1);
        }

        console.log(result.content[0].text); // Citation
        console.log();

        // Show content
        const resource = result.content[1];
        if (resource.type === "resource" && resource.resource?.text) {
          console.log("Content:");
          console.log("─".repeat(60));
          console.log(resource.resource.text);
          console.log("─".repeat(60));
        }
        break;
      }

      case "lines": {
        const [repo, path, startStr, endStr] = args;
        if (!repo || !path || !startStr || !endStr) {
          console.error("Usage: kb-cli.ts lines <repo> <path> <start> <end>");
          process.exit(1);
        }

        const start = parseInt(startStr);
        const end = parseInt(endStr);

        console.log(`📄 Fetching ${repo}/${path}:${start}-${end}\n`);

        const { handler } = makeFetchLines();
        const result = await handler({
          input: { repo, path, start, end },
        });

        if (result.isError) {
          console.error("❌ Fetch failed:", result.content[0].text);
          process.exit(1);
        }

        console.log(result.content[0].text); // Citation
        console.log();

        // Show content
        const resource = result.content[1];
        if (resource.type === "resource" && resource.resource?.text) {
          console.log("Content:");
          console.log("─".repeat(60));
          console.log(resource.resource.text);
          console.log("─".repeat(60));
        }
        break;
      }

      case "info": {
        console.log("ℹ️  Vector Store Information:\n");

        const { handler } = makeGetVectorStoreInfo();
        const result = await handler({});

        if (result.isError) {
          console.error("❌ Failed:", result.content[0].text);
          process.exit(1);
        }

        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      case "help":
      default: {
        console.log("Plastic Beach Knowledge Base CLI\n");
        console.log("Usage: bun run kb-cli.ts <command> [options]\n");
        console.log("Commands:");
        console.log("  search <query>              Search the knowledge base");
        console.log("  repos                       List indexed repositories");
        console.log("  chunk <chunk-id>            Fetch a chunk by ID");
        console.log("  lines <repo> <path> <start> <end>");
        console.log("                              Fetch file lines");
        console.log("  info                        Show vector store info");
        console.log("  help                        Show this help message");
        console.log();
        console.log("Environment Variables:");
        console.log("  KB_TOP_K=N                  Number of search results (default: 5)");
        console.log("  KB_REPOS=repo1,repo2        Filter search to specific repos");
        console.log();
        console.log("Examples:");
        console.log('  bun run kb-cli.ts search "authentication function"');
        console.log('  KB_TOP_K=10 bun run kb-cli.ts search "error handling"');
        console.log('  KB_REPOS=api-server bun run kb-cli.ts search "login"');
        console.log("  bun run kb-cli.ts repos");
        console.log("  bun run kb-cli.ts chunk abc123def456");
        console.log("  bun run kb-cli.ts lines my-repo src/main.py 1 50");
        console.log();
        console.log("Prerequisites:");
        console.log("  - kb-api server must be running (kb-api)");
        console.log("  - At least one repository indexed (kb-index /path --name name)");

        if (command && command !== "help") {
          console.error(`\nError: Unknown command "${command}"`);
          process.exit(1);
        }
        break;
      }
    }
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
    process.exit(1);
  }
}

main();
