import {
  analyzeTranscriptPhases,
  type TranscriptPhaseAnalysis,
  type TranscriptTurn,
} from "./transcript-phases.ts";

type CriterionEvaluation = {
  score: number | null;
  reasoning: string | null;
  evidence: string | null;
  recommendation?: string | null;
  alternative_formulation?: string | null;
  improvement_evidence?: string | null;
  improvement_priority?: number | null;
};

type CompleteImprovement = {
  recommendation?: string | null;
  alternative_formulation?: string | null;
  improvement_evidence?: string | null;
  improvement_priority?: number | null;
};

const MAX_PRIORITY_IMPROVEMENTS = 3;

function normalized(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("de")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\[[^\]]+]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableMatch(candidate: string, source: string) {
  const normalizedCandidate = normalized(candidate);
  const normalizedSource = normalized(source);
  if (normalizedCandidate.length < 12 || normalizedSource.length < 12) return false;
  return normalizedSource.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedSource);
}

function withoutImprovement<T extends CompleteImprovement>(evaluation: T) {
  return {
    ...evaluation,
    ...("recommendation" in evaluation ? { recommendation: null } : {}),
    ...("alternative_formulation" in evaluation ? { alternative_formulation: null } : {}),
    ...("improvement_evidence" in evaluation ? { improvement_evidence: null } : {}),
    ...("improvement_priority" in evaluation ? { improvement_priority: null } : {}),
  };
}

export function hasCompleteImprovement(evaluation: CompleteImprovement) {
  return typeof evaluation.recommendation === "string"
    && evaluation.recommendation.trim().length > 0
    && typeof evaluation.alternative_formulation === "string"
    && evaluation.alternative_formulation.trim().length > 0
    && typeof evaluation.improvement_evidence === "string"
    && evaluation.improvement_evidence.trim().length > 0;
}

export function selectSessionImprovements<T extends CompleteImprovement>(evaluations: T[]) {
  return evaluations
    .filter((evaluation) => (
      hasCompleteImprovement(evaluation)
      && Number.isInteger(evaluation.improvement_priority)
      && Number(evaluation.improvement_priority) >= 1
      && Number(evaluation.improvement_priority) <= MAX_PRIORITY_IMPROVEMENTS
    ))
    .sort((a, b) => Number(a.improvement_priority) - Number(b.improvement_priority))
    .slice(0, MAX_PRIORITY_IMPROVEMENTS);
}

export function sanitizeSessionStrengths(value: string | null, phaseAnalysis: TranscriptPhaseAnalysis) {
  if (phaseAnalysis.status !== "recognized" || !value) return [];
  return value
    .split(/\r?\n|;|,\s+/)
    .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_PRIORITY_IMPROVEMENTS);
}

export function validateCriterionEvaluations<T extends CriterionEvaluation>(
  evaluations: T[],
  transcript: TranscriptTurn[],
  phaseAnalysis: TranscriptPhaseAnalysis = analyzeTranscriptPhases(transcript),
) {
  const userMessages = phaseAnalysis.roleplayUserMessages;
  const agentMessages = transcript.filter((turn) => turn.role === "agent" && turn.message).map((turn) => turn.message as string);
  const reasoningFrequency = new Map<string, number>();

  for (const evaluation of evaluations) {
    if (!evaluation.reasoning) continue;
    const key = normalized(evaluation.reasoning);
    reasoningFrequency.set(key, (reasoningFrequency.get(key) ?? 0) + 1);
  }

  const validated = evaluations.map((evaluation) => {
    if (phaseAnalysis.status !== "recognized") {
      return withoutImprovement({
        ...evaluation,
        score: null,
        reasoning: null,
        evidence: null,
      });
    }

    const validScore = evaluation.score !== null
      && Number.isInteger(evaluation.score)
      && evaluation.score >= 1
      && evaluation.score <= 5;
    const reasoningKey = evaluation.reasoning ? normalized(evaluation.reasoning) : "";
    const hasSpecificReasoning = reasoningKey.length >= 12
      && reasoningFrequency.get(reasoningKey) === 1
      && !agentMessages.some((message) => comparableMatch(evaluation.reasoning as string, message));
    const hasUserEvidence = !!evaluation.evidence
      && userMessages.some((message) => comparableMatch(evaluation.evidence as string, message));

    const rating = validScore && hasSpecificReasoning && hasUserEvidence
      ? evaluation
      : {
      ...evaluation,
      score: null,
      reasoning: null,
      evidence: null,
    };

    const hasRoleplayImprovementEvidence = hasCompleteImprovement(evaluation)
      && userMessages.some((message) => comparableMatch(evaluation.improvement_evidence as string, message));

    const lowScore = rating.score !== null && rating.score >= 1 && rating.score <= 3;
    if (!lowScore) return withoutImprovement(rating);
    if (hasRoleplayImprovementEvidence) return rating;

    return withoutImprovement({
      ...rating,
      score: null,
      reasoning: null,
      evidence: null,
    });
  });

  const acceptedImprovementIndexes = validated
    .map((evaluation, index) => ({ evaluation, index }))
    .filter(({ evaluation }) => hasCompleteImprovement(evaluation))
    .sort((a, b) => (
      (
        Number.isInteger(a.evaluation.improvement_priority)
          ? Number(a.evaluation.improvement_priority)
          : Number.POSITIVE_INFINITY
      ) - (
        Number.isInteger(b.evaluation.improvement_priority)
          ? Number(b.evaluation.improvement_priority)
          : Number.POSITIVE_INFINITY
      )
      || Number(a.evaluation.score) - Number(b.evaluation.score)
      || a.index - b.index
    ))
    .slice(0, MAX_PRIORITY_IMPROVEMENTS);
  const accepted = new Map(acceptedImprovementIndexes.map(({ index }, rank) => [index, rank + 1]));

  return validated.map((evaluation, index) => {
    const normalizedPriority = accepted.get(index);
    return {
      ...evaluation,
      improvement_priority: normalizedPriority ?? null,
    };
  });
}
