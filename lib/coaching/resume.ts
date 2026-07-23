type CoachingResumeInput = {
  completedSessionCount: number;
  strengths?: unknown;
  focusAreas?: unknown;
};

function firstText(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim() ?? null;
}

export function buildCoachingResume({ completedSessionCount, strengths, focusAreas }: CoachingResumeInput) {
  if (completedSessionCount < 1) {
    return "Wir lernen uns heute erst kennen. Nach deiner ersten Session kann Ossi dir persönliche Stärken und einen passenden Lernfokus zeigen.";
  }

  const strength = firstText(strengths);
  const focus = firstText(focusAreas);
  const sentences = ["Aus deinen bisherigen Trainings kennt Ossi bereits deine Entwicklung."];
  sentences.push(strength
    ? `Besonders positiv fällt bisher ${strength} auf.`
    : "Mit jeder weiteren Session wird dein persönliches Profil genauer.");
  sentences.push(focus
    ? `Aktuell empfiehlt er ${focus} als nächsten Schwerpunkt – du kannst trotzdem jedes andere Thema trainieren.`
    : "Du kannst heute frei trainieren oder dich von Ossi überraschen lassen.");
  return sentences.join(" ");
}
