export const ROLEPLAY_START_MARKER = "Rollenspiel beginnt.";
export const ROLEPLAY_END_MARKER = "Rollenspiel beendet – zurück im Coach-Modus.";

export type TranscriptPhase = "coach_intro" | "roleplay" | "coach_debrief";
export type TranscriptBoundaryStatus = "recognized" | "missing" | "ambiguous";

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

function isBeforeOrEqual(left: Boundary, right: Boundary) {
  return left.turnIndex < right.turnIndex
    || (left.turnIndex === right.turnIndex && left.end <= right.start);
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
  startBoundary: Boundary,
  endBoundary: Boundary,
) {
  return transcript.flatMap((turn, turnIndex) => {
    const messageLength = typeof turn.message === "string" ? turn.message.length : 0;

    if (turnIndex < startBoundary.turnIndex) {
      return slicePhase(turn, turnIndex, 0, messageLength, "coach_intro");
    }
    if (turnIndex > endBoundary.turnIndex) {
      return slicePhase(turn, turnIndex, 0, messageLength, "coach_debrief");
    }
    if (startBoundary.turnIndex === endBoundary.turnIndex && turnIndex === startBoundary.turnIndex) {
      return [
        ...slicePhase(turn, turnIndex, 0, startBoundary.end, "coach_intro"),
        ...slicePhase(turn, turnIndex, startBoundary.end, endBoundary.start, "roleplay"),
        ...slicePhase(turn, turnIndex, endBoundary.start, messageLength, "coach_debrief"),
      ];
    }
    if (turnIndex === startBoundary.turnIndex) {
      return [
        ...slicePhase(turn, turnIndex, 0, startBoundary.end, "coach_intro"),
        ...slicePhase(turn, turnIndex, startBoundary.end, messageLength, "roleplay"),
      ];
    }
    if (turnIndex === endBoundary.turnIndex) {
      return [
        ...slicePhase(turn, turnIndex, 0, endBoundary.start, "roleplay"),
        ...slicePhase(turn, turnIndex, endBoundary.start, messageLength, "coach_debrief"),
      ];
    }
    return slicePhase(turn, turnIndex, 0, messageLength, "roleplay");
  });
}

function unresolvedAnalysis(
  transcript: TranscriptTurn[],
  status: Exclude<TranscriptBoundaryStatus, "recognized">,
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
  const starts = exactStarts.length > 0
    ? exactStarts
    : legacyStartBoundaries(transcript);
  const ends = matchesForPattern(transcript, END_PATTERN);

  if (starts.length === 0 || ends.length === 0) {
    return unresolvedAnalysis(
      transcript,
      "missing",
      starts.length === 0
        ? "Kein sicherer Rollenspiel-Startmarker gefunden."
        : "Kein sicherer Rollenspiel-Endmarker gefunden.",
    );
  }
  if (starts.length !== 1 || ends.length !== 1) {
    return unresolvedAnalysis(
      transcript,
      "ambiguous",
      "Rollenspiel-Grenzen sind mehrfach oder widersprüchlich markiert.",
    );
  }

  const [startBoundary] = starts;
  const [endBoundary] = ends;
  if (!isBeforeOrEqual(startBoundary, endBoundary)) {
    return unresolvedAnalysis(
      transcript,
      "ambiguous",
      "Der Rollenspiel-Endmarker liegt nicht nach dem Startmarker.",
    );
  }

  const segments = recognizedSegments(transcript, startBoundary, endBoundary);
  return {
    status: "recognized",
    reason: null,
    segments,
    roleplayUserMessages: segments
      .filter((segment) => segment.phase === "roleplay" && segment.role === "user")
      .map((segment) => segment.message),
  };
}
