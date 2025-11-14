// Enforce ~50KB total JSON payload cap. We measure serialized size of CallToolResult.
// Provide helpers to iteratively trim content according to spec order.

export function jsonSizeBytes(obj: unknown): number {
  return Buffer.byteLength(JSON.stringify(obj), "utf8");
}
