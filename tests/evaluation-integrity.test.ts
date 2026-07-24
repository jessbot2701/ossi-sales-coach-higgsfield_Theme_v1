import { describe, expect, it } from "vitest";
import { validateCriterionEvaluations } from "@/lib/coaching/evaluation-integrity";

const evaluation = (overrides: Partial<{ score: number | null; reasoning: string | null; evidence: string | null }> = {}) => ({
  score: 4,
  reasoning: "Du hast den Anlass klar benannt und bist ruhig in das Gespräch eingestiegen.",
  evidence: "Guten Tag, mein Name ist Weiß. Ich rufe wegen Ihrer Lagerprozesse an.",
  ...overrides,
});

const transcript = [
  { role: "agent", message: "Hallo, ich bin Ossi. Heute trainieren wir Kaltakquise. Bist du bereit?" },
  { role: "user", message: "Guten Tag, mein Name ist Weiß. Ich rufe wegen Ihrer Lagerprozesse an." },
];

describe("criterion evaluation integrity", () => {
  it("keeps a specific evaluation whose evidence occurs in a user turn", () => {
    expect(validateCriterionEvaluations([evaluation()], transcript)[0].score).toBe(4);
  });

  it("rejects evidence taken from an agent turn", () => {
    const result = validateCriterionEvaluations([
      evaluation({ evidence: "Hallo, ich bin Ossi. Heute trainieren wir Kaltakquise." }),
    ], transcript)[0];

    expect(result).toMatchObject({ score: null, reasoning: null, evidence: null });
  });

  it("rejects reasoning copied from an agent turn", () => {
    const result = validateCriterionEvaluations([
      evaluation({ reasoning: "Hallo, ich bin Ossi. Heute trainieren wir Kaltakquise. Bist du bereit?" }),
    ], transcript)[0];

    expect(result.score).toBeNull();
  });

  it("rejects a general explanation repeated across criteria", () => {
    const repeated = "Du solltest die Gesprächsführung insgesamt klarer und verbindlicher gestalten.";
    const result = validateCriterionEvaluations([
      evaluation({ reasoning: repeated }),
      evaluation({ reasoning: repeated }),
    ], transcript);

    expect(result.map((item) => item.score)).toEqual([null, null]);
  });

  it("matches evidence despite punctuation and a trailing ellipsis", () => {
    const result = validateCriterionEvaluations([
      evaluation({ evidence: "Guten Tag – mein Name ist Weiß. Ich rufe wegen Ihrer Lagerprozesse..." }),
    ], transcript)[0];

    expect(result.score).toBe(4);
  });
});
