import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE, formatAppDateTime, formatAppTime } from "@/lib/date-time";

describe("central app time zone", () => {
  it("uses Europe/Berlin everywhere", () => {
    expect(APP_TIME_ZONE).toBe("Europe/Berlin");
  });

  it("applies daylight-saving time in summer", () => {
    expect(formatAppTime("2026-07-29T12:00:00.000Z")).toBe("14:00");
  });

  it("applies standard time in winter", () => {
    expect(formatAppTime("2026-01-29T12:00:00.000Z")).toBe("13:00");
    expect(formatAppDateTime("2026-01-29T12:00:00.000Z")).toContain("13:00");
  });
});
