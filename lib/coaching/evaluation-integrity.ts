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
};

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

  return evaluations.map((evaluation) => {
    if (phaseAnalysis.status !== "recognized") {
      return {
        ...evaluation,
        score: null,
        reasoning: null,
        evidence: null,
        ...("recommendation" in evaluation ? { recommendation: null } : {}),
      };
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

    if (validScore && hasSpecificReasoning && hasUserEvidence) return evaluation;
    return {
      ...evaluation,
      score: null,
      reasoning: null,
      evidence: null,
      ...("recommendation" in evaluation ? { recommendation: null } : {}),
    };
  });
}
