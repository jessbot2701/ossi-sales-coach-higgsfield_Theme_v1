type RatedCriterion = {
  score: number | null;
  name?: string | null;
};

const ENGLISH_MARKERS = /\b(the|this|that|was|were|with|from|where|user|customer|conversation|sales|role-play|attempted|provided|feedback|learning|goal|strengths?|strong|opening|questions?|discovery|improve(?:ment|d)?|during|focused|however|overall)\b/gi;
const GERMAN_MARKERS = /\b(der|die|das|du|dein|deine|diese|dieser|mit|und|oder|wurde|hast|gespräch|kunde|stärke|lernziel|verbesserung|insgesamt|jedoch)\b/gi;

export function isProbablyEnglish(value: string | null | undefined) {
  if (!value?.trim()) return false;
  const english = value.match(ENGLISH_MARKERS)?.length ?? 0;
  const german = value.match(GERMAN_MARKERS)?.length ?? 0;
  return english >= 2 && english > german * 1.5;
}

function rated(criteria: RatedCriterion[]) {
  return criteria.filter((item): item is RatedCriterion & { score: number } => (
    typeof item.score === "number" && Number.isFinite(item.score)
  ));
}

export function deterministicGermanSummary(criteria: RatedCriterion[]) {
  const values = rated(criteria);
  if (!values.length) {
    return "Für diese Session konnte kein belastbares Kurzfazit aus den beobachteten Gesprächsanteilen erstellt werden.";
  }
  const average = values.reduce((sum, item) => sum + item.score, 0) / values.length;
  if (average >= 4.25) {
    return "Du hast das Gespräch insgesamt sehr überzeugend, klar und zielgerichtet geführt.";
  }
  if (average >= 3.5) {
    return "Du hast das Gespräch insgesamt solide bis überzeugend geführt und mehrere wirksame Ansätze gezeigt.";
  }
  if (average >= 2.5) {
    return "Du hast eine solide Grundlage gezeigt; in einzelnen Kompetenzfeldern gibt es konkrete Entwicklungsmöglichkeiten.";
  }
  return "Die Session zeigt mehrere konkrete Ansatzpunkte, die du im nächsten Training gezielt weiterentwickeln kannst.";
}

export function ensureGermanSummary(
  providerSummary: string | null | undefined,
  criteria: RatedCriterion[],
) {
  const summary = providerSummary?.trim();
  return summary && !isProbablyEnglish(summary)
    ? summary
    : deterministicGermanSummary(criteria);
}

export function ensureGermanStrengths(
  providerStrengths: string[],
  criteria: RatedCriterion[],
) {
  const germanStrengths = providerStrengths.filter((item) => !isProbablyEnglish(item)).slice(0, 3);
  if (germanStrengths.length) return germanStrengths;
  return rated(criteria)
    .filter((item) => item.score >= 4 && item.name?.trim())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => `${item.name}: überzeugend umgesetzt`);
}

export function ensureGermanLearningGoal(
  providerGoal: string | null | undefined,
  criteria: RatedCriterion[],
) {
  const goal = providerGoal?.trim();
  if (goal && !isProbablyEnglish(goal)) return goal;
  const weakest = rated(criteria)
    .filter((item) => item.name?.trim())
    .sort((a, b) => a.score - b.score)[0];
  return weakest
    ? `${weakest.name} in einer konkreten Gesprächssituation gezielt trainieren.`
    : null;
}
