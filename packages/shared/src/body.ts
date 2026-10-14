export const MAX_REQUEST_BYTES = 16 * 1024;
export class RequestTooLarge extends Error {}
/** 在累计到限制前停止读取；chunked 请求没有 Content-Length 也不能绕过限制。 */
export async function readLimitedBody(
  stream: ReadableStream<Uint8Array> | null,
  limit = MAX_REQUEST_BYTES,
): Promise<ArrayBuffer> {
  if (!stream) return new ArrayBuffer(0);
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new RequestTooLarge("Request body exceeds limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer;
}
