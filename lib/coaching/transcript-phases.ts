export const ROLEPLAY_START_MARKER = "Rollenspiel beginnt.";
export const ROLEPLAY_END_MARKER = "Rollenspiel beendet – zurück im Coach-Modus.";

export type TranscriptPhase = "coach_intro" | "roleplay" | "coach_debrief";
export type TranscriptBoundaryStatus = "recognized" | "partial" | "missing" | "ambiguous";

export type TranscriptTurn = {
  role?: string;
  message?: string;
  [key: string]: unknown;
};

export type TranscriptSegment = {
  turnIndex: number;
  role?: string;
  message: string;
  phase: TranscriptPhase;
};

type Boundary = {
  turnIndex: number;
  start: number;
  end: number;
};

export type TranscriptPhaseAnalysis = {
  status: TranscriptBoundaryStatus;
  reason: string | null;
  segments: TranscriptSegment[];
  roleplayUserMessages: string[];
};

const EXACT_START_PATTERN = /Rollenspiel beginnt\./giu;
const LEGACY_START_PATTERNS = [
  /Du rufst jetzt an/giu,
  /Telefon klingelt/giu,
];
const END_PATTERN = /Rollenspiel beendet\s*[–—-]\s*zurück im Coach-Modus\./giu;

function matchesForPattern(
  transcript: TranscriptTurn[],
  pattern: RegExp,
): Boundary[] {
  const matches: Boundary[] = [];

  transcript.forEach((turn, turnIndex) => {
    if (turn.role !== "agent" || typeof turn.message !== "string") return;
    pattern.lastIndex = 0;
    for (const match of turn.message.matchAll(pattern)) {
      matches.push({
        turnIndex,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  });

  return matches;
}

function legacyStartBoundaries(transcript: TranscriptTurn[]): Boundary[] {
  const byTurn = new Map<number, Boundary>();

  for (const pattern of LEGACY_START_PATTERNS) {
    for (const match of matchesForPattern(transcript, pattern)) {
      const existing = byTurn.get(match.turnIndex);
      if (!existing) {
        byTurn.set(match.turnIndex, match);
      } else {
        byTurn.set(match.turnIndex, {
          turnIndex: match.turnIndex,
          start: Math.min(existing.start, match.start),
          end: Math.max(existing.end, match.end),
        });
      }
    }
  }

  return [...byTurn.values()].sort((a, b) => a.turnIndex - b.turnIndex);
}

export function hasEvaluableRoleplay(analysis: TranscriptPhaseAnalysis) {
  return analysis.status === "recognized" || analysis.status === "partial";
}

function slicePhase(
  turn: TranscriptTurn,
  turnIndex: number,
  start: number,
  end: number,
  phase: TranscriptPhase,
): TranscriptSegment[] {
  const message = typeof turn.message === "string"
    ? turn.message.slice(start, end)
    : "";
  return message.trim()
    ? [{ turnIndex, role: turn.role, message, phase }]
    : [];
}

function recognizedSegments(
  transcript: TranscriptTurn[],
  intervals: { start: Boundary; end: Boundary }[],
) {
  const transitions = intervals.flatMap(({ start, end }) => [
    { turnIndex: start.turnIndex, offset: start.end, phase: "roleplay" as const },
    { turnIndex: end.turnIndex, offset: end.start, phase: "coach_debrief" as const },
  ]);
  let phase: TranscriptPhase = "coach_intro";
  let transitionIndex = 0;

  return transcript.flatMap((turn, turnIndex) => {
    const messageLength = typeof turn.message === "string" ? turn.message.length : 0;
    const segments: TranscriptSegment[] = [];
    let cursor = 0;
    while (transitions[transitionIndex]?.turnIndex === turnIndex) {
      const transition = transitions[transitionIndex++];
      segments.push(...slicePhase(turn, turnIndex, cursor, transition.offset, phase));
      cursor = transition.offset;
      phase = transition.phase;
    }
    segments.push(...slicePhase(turn, turnIndex, cursor, messageLength, phase));
    return segments;
  });
}

function unresolvedAnalysis(
  transcript: TranscriptTurn[],
  status: "missing" | "ambiguous",
  reason: string,
): TranscriptPhaseAnalysis {
  const segments = transcript.flatMap((turn, turnIndex) => {
    const messageLength = typeof turn.message === "string" ? turn.message.length : 0;
    return slicePhase(turn, turnIndex, 0, messageLength, "coach_intro");
  });
  return { status, reason, segments, roleplayUserMessages: [] };
}

export function analyzeTranscriptPhases(
  transcript: TranscriptTurn[],
): TranscriptPhaseAnalysis {
  const exactStarts = matchesForPattern(transcript, EXACT_START_PATTERN);
  // A later exercise may use legacy wording even when an earlier one used an
  // exact marker. In a mixed turn the exact marker remains authoritative.
  const exactStartTurns = new Set(exactStarts.map((boundary) => boundary.turnIndex));
  const starts = [
    ...exactStarts,
    ...legacyStartBoundaries(transcript).filter((boundary) => !exactStartTurns.has(boundary.turnIndex)),
  ];
  const ends = matchesForPattern(transcript, END_PATTERN);
  const boundaries = [
    ...starts.map((boundary) => ({ ...boundary, kind: "start" as const })),
    ...ends.map((boundary) => ({ ...boundary, kind: "end" as const })),
  ].sort((a, b) => a.turnIndex - b.turnIndex || a.start - b.start);
  const intervals: { start: Boundary; end: Boundary }[] = [];
  let open: { boundary: Boundary; valid: boolean } | null = null;
  let malformed = false;

  for (const boundary of boundaries) {
    if (boundary.kind === "start") {
      if (open) {
        // Nested starts make the entire open exercise unsafe, including text
        // before the second start. Resume only after an explicit end.
        open.valid = false;
        malformed = true;
      } else {
        open = { boundary, valid: true };
      }
    } else if (open) {
      if (open.valid) intervals.push({ start: open.boundary, end: boundary });
      open = null;
    } else {
      malformed = true;
    }
  }

  if (!intervals.length) {
    return unresolvedAnalysis(
      transcript,
      malformed ? "ambiguous" : "missing",
      malformed
        ? "Rollenspiel-Grenzen sind widersprüchlich markiert."
        : starts.length === 0
          ? "Kein sicherer Rollenspiel-Startmarker gefunden."
          : "Kein sicherer Rollenspiel-Endmarker gefunden.",
    );
  }

  const partial = malformed || open !== null;
  const segments = recognizedSegments(transcript, intervals);
  return {
    status: partial ? "partial" : "recognized",
    reason: partial
      ? "Nur vollständig abgeschlossene, eindeutige Rollenspielabschnitte sind auswertbar."
      : null,
    segments,
    roleplayUserMessages: segments
      .filter((segment) => segment.phase === "roleplay" && segment.role === "user")
      .map((segment) => segment.message),
  };
}
