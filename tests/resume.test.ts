import { describe, expect, it } from "vitest";
import { buildCoachingResume } from "@/lib/coaching/resume";

describe("personal coaching resume", () => {
  it("introduces Ossi without inventing history for a new user", () => {
    const resume = buildCoachingResume({ completedSessionCount: 0 });
    expect(resume).toContain("lernen uns heute erst kennen");
    expect(resume.split(".").filter(Boolean)).toHaveLength(2);
  });

  it("summarizes a known user in three short sentences without restricting the training", () => {
    const resume = buildCoachingResume({
      completedSessionCount: 4,
      strengths: ["Nutzenorientierung"],
      focusAreas: ["Einwandbehandlung"],
    });
    expect(resume).toContain("Nutzenorientierung");
    expect(resume).toContain("Einwandbehandlung");
    expect(resume).toContain("jedes andere Thema trainieren");
    expect(resume.split(".").filter(Boolean)).toHaveLength(3);
  });
});
