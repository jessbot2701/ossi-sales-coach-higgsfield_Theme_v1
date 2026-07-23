import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyElevenLabsSignature } from "@/lib/elevenlabs/signature";

describe("ElevenLabs webhook signatures", () => {
  const body = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "conv_test" } });
  const secret = "webhook-secret";
  const now = 1_750_000_000;
  const digest = createHmac("sha256", secret).update(`${now}.${body}`).digest("hex");

  it("accepts a valid current signature", () => {
    expect(verifyElevenLabsSignature(body, `t=${now},v0=${digest}`, secret, now)).toBe(true);
  });

  it("rejects tampered payloads and stale timestamps", () => {
    expect(verifyElevenLabsSignature(`${body} `, `t=${now},v0=${digest}`, secret, now)).toBe(false);
    expect(verifyElevenLabsSignature(body, `t=${now - 301},v0=${digest}`, secret, now)).toBe(false);
  });

  it("rejects missing and malformed headers", () => {
    expect(verifyElevenLabsSignature(body, null, secret, now)).toBe(false);
    expect(verifyElevenLabsSignature(body, "t=nope,v0=1234", secret, now)).toBe(false);
  });
});
