import { describe, expect, it } from "vitest";
import { readTextBodyWithLimit } from "@/lib/request-body";

describe("bounded request bodies", () => {
  it("reads payloads within the configured limit", async () => {
    const request = new Request("https://example.test/webhook", {
      method: "POST",
      body: "valid payload",
    });

    await expect(readTextBodyWithLimit(request, 100)).resolves.toBe("valid payload");
  });

  it("rejects streamed payloads above the configured limit", async () => {
    const request = new Request("https://example.test/webhook", {
      method: "POST",
      body: "payload is too large",
    });

    await expect(readTextBodyWithLimit(request, 5)).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });

  it("rejects an oversized declared content length before reading", async () => {
    const request = new Request("https://example.test/webhook", {
      method: "POST",
      headers: { "content-length": "1000" },
      body: "small",
    });

    await expect(readTextBodyWithLimit(request, 100)).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });
});
