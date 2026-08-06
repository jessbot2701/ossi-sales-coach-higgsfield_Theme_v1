import { describe, expect, it } from "vitest";
import { getErrorMessage } from "@/lib/api";

describe("error messages", () => {
  it("extracts messages from Error instances", () => {
    expect(getErrorMessage(new Error("kaputt"))).toBe("kaputt");
  });

  it("extracts messages from plain provider and database error objects", () => {
    expect(getErrorMessage({ message: "constraint violated", code: "23514" }))
      .toBe("constraint violated");
  });

  it("uses a caller-provided fallback for unknown values", () => {
    expect(getErrorMessage({ code: "unknown" }, "Unbekannter Webhook-Fehler"))
      .toBe("Unbekannter Webhook-Fehler");
  });
});
