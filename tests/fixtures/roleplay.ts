import { ROLEPLAY_END_MARKER, ROLEPLAY_START_MARKER } from "@/lib/coaching/transcript-phases";

export const firstEvidence = "Guten Tag, ich rufe wegen Ihrer Lagerprozesse an.";
export const secondEvidence = "Welche Engpässe möchten Sie in Ihrem Lager zuerst lösen?";
export const coachingReply = "Ich habe dein Zwischenfeedback verstanden und möchte es noch einmal üben.";
export const coachSuggestion = "Mein Vorschlag: Lassen Sie uns Ihre strategischen Ziele gemeinsam priorisieren.";
export const learningGoal = "In der nächsten Übung stelle ich zwei offene Bedarfsfragen, bevor ich eine Lösung anbiete.";

export const twoRoleplays = [
  { role: "agent", message: "Willkommen beim Coaching." },
  { role: "agent", message: ROLEPLAY_START_MARKER },
  { role: "user", message: firstEvidence },
  { role: "agent", message: ROLEPLAY_END_MARKER },
  { role: "agent", message: coachSuggestion },
  { role: "user", message: coachingReply },
  { role: "agent", message: ROLEPLAY_START_MARKER },
  { role: "user", message: secondEvidence },
  { role: "agent", message: ROLEPLAY_END_MARKER },
  { role: "agent", message: "Zum Abschluss besprechen wir dein Lernziel." },
];
