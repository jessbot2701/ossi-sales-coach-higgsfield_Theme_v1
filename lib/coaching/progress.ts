import type { CompetencyAggregate, ScoreEntry, Trend } from "@/types/domain";

const round = (value: number) => Math.round(value * 100) / 100;
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
export const STRENGTH_MIN_RATINGS = 3;
export const STRENGTH_MIN_AVERAGE_SCORE = 4;

function trendFor(scoresNewestFirst: number[]): Trend {
  if (scoresNewestFirst.length < 6) return "insufficient_data";
  const recent = average(scoresNewestFirst.slice(0, 3));
  const previous = average(scoresNewestFirst.slice(3, 6));
  if (recent - previous >= 0.35) return "up";
  if (previous - recent >= 0.35) return "down";
  return "stable";
}

export function aggregateCompetencyProgress(entries: ScoreEntry[]): CompetencyAggregate[] {
  const grouped = new Map<string, ScoreEntry[]>();
  for (const entry of entries) {
    const values = grouped.get(entry.competencyId) ?? [];
    values.push(entry);
    grouped.set(entry.competencyId, values);
  }

  return [...grouped.values()].map((values) => {
    const sorted = values.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    return {
      competencyId: sorted[0].competencyId,
      competencyName: sorted[0].competencyName,
      sessionCount: sorted.length,
      averageScore: round(average(sorted.map((entry) => entry.score))),
      latestScore: sorted[0].score,
      trend: trendFor(sorted.map((entry) => entry.score)),
    };
  });
}

export function deriveLearningProfile(aggregates: CompetencyAggregate[], explicitGoal?: string | null) {
  const ranked = [...aggregates].sort((a, b) => a.latestScore - b.latestScore || a.averageScore - b.averageScore);
  const strengths = aggregates
    .filter((item) => item.sessionCount >= STRENGTH_MIN_RATINGS && item.averageScore >= STRENGTH_MIN_AVERAGE_SCORE)
    .sort((a, b) => b.averageScore - a.averageScore)
    .map((item) => item.competencyName);
  const focusAreas = ranked.slice(0, 2).map((item) => item.competencyName);
  const fallbackGoal = ranked[0] ? `${ranked[0].competencyName} in der nächsten Session gezielt trainieren.` : null;
  return { strengths, focusAreas, nextLearningGoal: explicitGoal?.trim() || fallbackGoal };
}
