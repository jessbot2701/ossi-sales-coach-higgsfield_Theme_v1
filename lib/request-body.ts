import { ApiError } from "@/lib/api";

export async function readTextBodyWithLimit(request: Request, maxBytes: number) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new ApiError(413, "Die Anfrage ist zu groß.", "payload_too_large");
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, "Die Anfrage ist zu groß.", "payload_too_large");
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join("");
}
