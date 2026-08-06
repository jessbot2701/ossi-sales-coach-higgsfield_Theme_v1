import { describe, expect, it } from "vitest";
import {
  ensureGermanLearningGoal,
  ensureGermanStrengths,
  ensureGermanSummary,
  isProbablyEnglish,
} from "@/lib/coaching/german-output";

const criteria = [
  { name: "Gesprächseröffnung", score: 4 },
  { name: "Fragetechnik und Bedarfsermittlung", score: 2 },
  { name: "Nutzenargumentation", score: 3 },
];

describe("German coaching output", () => {
  it("recognizes an English provider summary and replaces it deterministically", () => {
    const english = "The conversation was a sales role-play where the user attempted to invite a customer.";
    expect(isProbablyEnglish(english)).toBe(true);
    const first = ensureGermanSummary(english, criteria);
    expect(first).toBe(ensureGermanSummary(english, criteria));
    expect(first).toBe("Du hast eine solide Grundlage gezeigt; in einzelnen Kompetenzfeldern gibt es konkrete Entwicklungsmöglichkeiten.");
  });

  it("keeps a German provider summary", () => {
    expect(ensureGermanSummary("Du hast den Anlass klar und ruhig vermittelt.", criteria))
      .toBe("Du hast den Anlass klar und ruhig vermittelt.");
  });

  it("derives German strengths and a German goal when provider text is English", () => {
    expect(ensureGermanStrengths(["Strong opening"], criteria)).toEqual([
      "Gesprächseröffnung: überzeugend umgesetzt",
    ]);
    expect(ensureGermanLearningGoal("Improve discovery questions", criteria))
      .toBe("Fragetechnik und Bedarfsermittlung in einer konkreten Gesprächssituation gezielt trainieren.");
  });
});
