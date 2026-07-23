import { describe, expect, it } from "vitest";
import { aggregateCompetencyProgress, deriveLearningProfile } from "@/lib/coaching/progress";

describe("learning progress", () => {
  it("compares the newest three scores with the preceding three", () => {
    const scores = [5, 5, 4, 3, 3, 3];
    const entries = scores.map((score, index) => ({ competencyId: "a", competencyName: "Fragetechnik", score, completedAt: `2026-07-${String(18 - index).padStart(2, "0")}T10:00:00Z` }));
    expect(aggregateCompetencyProgress(entries)[0]).toMatchObject({ sessionCount: 6, latestScore: 5, trend: "up" });
  });

  it("marks stable strengths only after three ratings and picks two weakest focuses", () => {
    const profile = deriveLearningProfile([
      { competencyId: "a", competencyName: "Sprache", sessionCount: 3, averageScore: 4.2, latestScore: 4, trend: "stable" },
      { competencyId: "b", competencyName: "Abschluss", sessionCount: 3, averageScore: 2.8, latestScore: 2, trend: "stable" },
      { competencyId: "c", competencyName: "Fragen", sessionCount: 2, averageScore: 4.5, latestScore: 3, trend: "insufficient_data" },
    ]);
    expect(profile.strengths).toEqual(["Sprache"]);
    expect(profile.focusAreas).toEqual(["Abschluss", "Fragen"]);
    expect(profile.nextLearningGoal).toContain("Abschluss");
  });
});
