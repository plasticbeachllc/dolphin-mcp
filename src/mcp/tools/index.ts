import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod";
import { makeSearchKnowledge } from "./search_knowledge.js";
import { makeFetchChunk } from "./fetch_chunk.js";
import { makeFetchLines } from "./fetch_lines.js";
import { makeOpenInEditor } from "./open_in_editor.js";
import { makeGetVectorStoreInfo } from "./get_vector_store_info.js";
import { makeGetMetadata } from "./get_metadata.js";
import { makeFileWrite } from "./file-write-tool.js";
import { makeReadFiles } from "./read-files-tool.js";

export interface ToolRegistration {
  definition: Tool;
  handler: any;
  inputSchema?: ZodRawShape;
}

export const tools: ToolRegistration[] = [
  makeSearchKnowledge(),
  makeFetchChunk(),
  makeFetchLines(),
  makeOpenInEditor(),
  makeGetVectorStoreInfo(),
  makeGetMetadata(),
  makeFileWrite(),
  makeReadFiles(),
];
