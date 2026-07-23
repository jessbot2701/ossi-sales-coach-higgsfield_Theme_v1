const SCORE_KEYS = [
  "conversation_opening",
  "needs_discovery",
  "value_proposition",
  "objection_handling",
  "closing",
  "language_impact",
] as const;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function collectedValue(collection: UnknownRecord, key: string) {
  const entry = collection[key];
  return record(entry).value ?? entry;
}

export function extractPostCallAnalysis(analysisValue: unknown) {
  const analysis = record(analysisValue);
  const collection = record(analysis.data_collection_results ?? analysis.data_collection);
  const scores = Object.fromEntries(SCORE_KEYS.map((key) => {
    const numeric = Number(collectedValue(collection, key));
    return [key, Number.isInteger(numeric) && numeric >= 1 && numeric <= 5 ? numeric : null];
  })) as Record<(typeof SCORE_KEYS)[number], number | null>;

  const text = (key: string) => {
    const value = collectedValue(collection, key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  const criterionText = (suffix: "feedback" | "evidence") => Object.fromEntries(
    SCORE_KEYS.map((key) => [key, text(`${key}_${suffix}`)]),
  ) as Record<(typeof SCORE_KEYS)[number], string | null>;

  return {
    scores,
    feedback: criterionText("feedback"),
    criterionEvidence: criterionText("evidence"),
    summary: text("summary") ?? (typeof analysis.transcript_summary === "string" ? analysis.transcript_summary : null),
    strengths: text("strengths"),
    improvements: text("improvements"),
    evidence: text("evidence"),
    nextLearningGoal: text("next_learning_goal"),
  };
}
