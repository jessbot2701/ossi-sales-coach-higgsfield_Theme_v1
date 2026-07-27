import { describe, expect, it } from "vitest";
import {
  analyzeTranscriptPhases,
  ROLEPLAY_END_MARKER,
  ROLEPLAY_START_MARKER,
} from "@/lib/coaching/transcript-phases";

describe("transcript phase detection", () => {
  it("recognizes the exact phase markers and exposes only roleplay user messages", () => {
    const result = analyzeTranscriptPhases([
      { role: "agent", message: "Willkommen beim Coaching." },
      { role: "user", message: "Ich bin bereit." },
      { role: "agent", message: ROLEPLAY_START_MARKER },
      { role: "user", message: "Guten Tag, wie steuern Sie heute Ihr Lager?" },
      { role: "agent", message: ROLEPLAY_END_MARKER },
      { role: "user", message: "Das hört sich besser an. Ciao, Ossi." },
    ]);

    expect(result.status).toBe("recognized");
    expect(result.roleplayUserMessages).toEqual([
      "Guten Tag, wie steuern Sie heute Ihr Lager?",
    ]);
    expect(result.segments.map((segment) => segment.phase)).toEqual([
      "coach_intro",
      "coach_intro",
      "coach_intro",
      "roleplay",
      "coach_debrief",
      "coach_debrief",
    ]);
  });

  it.each([
    "Du rufst jetzt an.",
    "Telefon klingelt.",
    "Du rufst jetzt an. Telefon klingelt.",
  ])("recognizes a legacy start signal: %s", (legacyStart) => {
    const result = analyzeTranscriptPhases([
      { role: "agent", message: legacyStart },
      { role: "user", message: "Guten Tag, ich möchte über SAP EWM sprechen." },
      { role: "agent", message: ROLEPLAY_END_MARKER },
    ]);

    expect(result.status).toBe("recognized");
    expect(result.roleplayUserMessages).toEqual([
      "Guten Tag, ich möchte über SAP EWM sprechen.",
    ]);
  });

  it("splits mixed transition turns at both exact markers", () => {
    const result = analyzeTranscriptPhases([
      {
        role: "agent",
        message: "<Helmut>Dann legen wir los. Rollenspiel beginnt.</Helmut><Christian>Guten Tag.</Christian>",
      },
      { role: "user", message: "Guten Tag, hier ist Weiß von IGZ." },
      {
        role: "agent",
        message: "<Christian>Auf Wiederhören.</Christian><Helmut>Rollenspiel beendet – zurück im Coach-Modus. Das war klar.</Helmut>",
      },
    ]);

    expect(result.status).toBe("recognized");
    expect(result.segments.map(({ phase }) => phase)).toEqual([
      "coach_intro",
      "roleplay",
      "roleplay",
      "roleplay",
      "coach_debrief",
    ]);
    expect(result.segments[0].message).toContain(ROLEPLAY_START_MARKER);
    expect(result.segments[1].message).toContain("Guten Tag.");
    expect(result.segments[3].message).toContain("Auf Wiederhören.");
    expect(result.segments[4].message).toContain(ROLEPLAY_END_MARKER);
  });

  it("does not recognize a transcript with a missing end boundary", () => {
    const result = analyzeTranscriptPhases([
      { role: "agent", message: ROLEPLAY_START_MARKER },
      { role: "user", message: "Guten Tag." },
    ]);

    expect(result).toMatchObject({ status: "missing", roleplayUserMessages: [] });
  });

  it("does not guess when exact boundaries occur more than once", () => {
    const result = analyzeTranscriptPhases([
      { role: "agent", message: ROLEPLAY_START_MARKER },
      { role: "agent", message: ROLEPLAY_START_MARKER },
      { role: "user", message: "Guten Tag." },
      { role: "agent", message: ROLEPLAY_END_MARKER },
    ]);

    expect(result).toMatchObject({ status: "ambiguous", roleplayUserMessages: [] });
  });

  it("does not recognize reversed boundaries", () => {
    const result = analyzeTranscriptPhases([
      { role: "agent", message: ROLEPLAY_END_MARKER },
      { role: "agent", message: ROLEPLAY_START_MARKER },
    ]);

    expect(result).toMatchObject({ status: "ambiguous", roleplayUserMessages: [] });
  });
});
