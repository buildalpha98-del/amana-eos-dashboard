/** Read a bounded prefix, even if an upstream server ignores a Range header. */
export async function readResponsePrefix(response: Response, maxBytes: number): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("A positive byte limit is required");
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let remaining = maxBytes;
  let finished = false;
  try {
    while (remaining > 0) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      const prefix = value.subarray(0, remaining);
      chunks.push(Buffer.from(prefix));
      remaining -= prefix.byteLength;
    }
    return Buffer.concat(chunks);
  } finally {
    // Stop the download as soon as the prefix is complete. Never buffer the
    // rest of a recording or an unbounded response just to inspect its header.
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
