const SCORE_KEYS = [
  "conversation_opening",
  "needs_discovery",
  "value_proposition",
  "objection_handling",
  "closing",
  "language_impact",
] as const;

type UnknownRecord = Record<string, unknown>;
const MAX_ANALYSIS_TEXT_CHARS = 20_000;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function collectedValue(collection: UnknownRecord, key: string) {
  const entry = collection[key];
  return record(entry).value ?? entry;
}

function structuredRecord(value: unknown) {
  if (typeof value !== "string") return record(value);
  try {
    return record(JSON.parse(value.replace(/^```(?:json)?\s*|\s*```$/gi, "")));
  } catch {
    return {};
  }
}

export function extractPostCallAnalysis(analysisValue: unknown) {
  const analysis = record(analysisValue);
  const collection = record(analysis.data_collection_results ?? analysis.data_collection);
  const scores = Object.fromEntries(SCORE_KEYS.map((key) => {
    const numeric = Number(collectedValue(collection, key));
    return [key, Number.isInteger(numeric) && numeric >= 1 && numeric <= 5 ? numeric : null];
  })) as Record<(typeof SCORE_KEYS)[number], number | null>;

  const text = (key: string, allowTruncation = true) => {
    const value = collectedValue(collection, key);
    if (!allowTruncation && typeof value === "string" && value.trim().length > MAX_ANALYSIS_TEXT_CHARS) return null;
    return typeof value === "string" && value.trim()
      ? value.trim().slice(0, MAX_ANALYSIS_TEXT_CHARS)
      : null;
  };

  const criterionText = (suffix: "feedback" | "evidence") => Object.fromEntries(
    SCORE_KEYS.map((key) => [key, text(`${key}_${suffix}`, suffix !== "evidence")]),
  ) as Record<(typeof SCORE_KEYS)[number], string | null>;

  const criterionImprovements = Object.fromEntries(SCORE_KEYS.map((key) => {
    const raw = collectedValue(collection, `${key}_improvement`);
    const improvement = structuredRecord(raw);
    const improvementText = (field: "improvement" | "alternative" | "evidence") => {
      const value = improvement[field];
      if (field === "evidence" && typeof value === "string" && value.trim().length > MAX_ANALYSIS_TEXT_CHARS) return null;
      return typeof value === "string" && value.trim()
        ? value.trim().slice(0, MAX_ANALYSIS_TEXT_CHARS)
        : null;
    };
    const numericPriority = Number(improvement.priority);
    return [key, {
      improvement: improvementText("improvement"),
      alternative: improvementText("alternative"),
      evidence: improvementText("evidence"),
      priority: Number.isInteger(numericPriority) && numericPriority >= 1 && numericPriority <= 3
        ? numericPriority
        : null,
    }];
  })) as Record<(typeof SCORE_KEYS)[number], {
    improvement: string | null;
    alternative: string | null;
    evidence: string | null;
    priority: number | null;
  }>;
  const sessionConclusion = structuredRecord(collectedValue(collection, "session_conclusion"));
  const conclusionText = (field: "summary" | "next_learning_goal") => {
    const value = sessionConclusion[field];
    return typeof value === "string" && value.trim()
      ? value.trim().slice(0, MAX_ANALYSIS_TEXT_CHARS)
      : null;
  };
  const strengths = (value: unknown) => Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 3)
      .map((item) => item.trim().slice(0, MAX_ANALYSIS_TEXT_CHARS))
    : typeof value === "string" && value.trim()
      ? value.trim().slice(0, MAX_ANALYSIS_TEXT_CHARS)
      : null;

  return {
    scores,
    feedback: criterionText("feedback"),
    criterionEvidence: criterionText("evidence"),
    improvementsByCriterion: Object.fromEntries(SCORE_KEYS.map((key) => [key, criterionImprovements[key].improvement])),
    alternativesByCriterion: Object.fromEntries(SCORE_KEYS.map((key) => [key, criterionImprovements[key].alternative])),
    improvementEvidenceByCriterion: Object.fromEntries(SCORE_KEYS.map((key) => [key, criterionImprovements[key].evidence])),
    improvementPriorities: Object.fromEntries(SCORE_KEYS.map((key) => [key, criterionImprovements[key].priority])),
    summary: conclusionText("summary") ?? text("summary") ?? (
      typeof analysis.transcript_summary === "string"
        ? analysis.transcript_summary.trim().slice(0, MAX_ANALYSIS_TEXT_CHARS)
        : null
    ),
    strengths: strengths(sessionConclusion.strengths) ?? strengths(collectedValue(collection, "strengths")),
    improvements: text("improvements"),
    evidence: text("evidence"),
    nextLearningGoal: conclusionText("next_learning_goal") ?? text("next_learning_goal"),
  };
}
