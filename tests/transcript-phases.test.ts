import { describe, expect, it } from "vitest";
import {
  analyzeTranscriptPhases,
  ROLEPLAY_END_MARKER,
  ROLEPLAY_START_MARKER,
} from "@/lib/coaching/transcript-phases";
import { coachingReply, firstEvidence, secondEvidence, twoRoleplays } from "./fixtures/roleplay";

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

  it("recognizes two exercises and leaves intermediate coaching outside the roleplay", () => {
    const result = analyzeTranscriptPhases(twoRoleplays);
    expect(result.status).toBe("recognized");
    expect(result.roleplayUserMessages).toEqual([firstEvidence, secondEvidence]);
    expect(result.segments.find((segment) => segment.message === coachingReply)?.phase)
      .toBe("coach_debrief");
    expect(result.segments.filter((segment) => segment.role === "user").map((segment) => segment.phase))
      .toEqual(["roleplay", "coach_debrief", "roleplay"]);
  });

  it("recognizes three consecutive exercises", () => {
    const messages = [firstEvidence, secondEvidence, "Wann passt Ihnen ein gemeinsamer Termin zur Prozessanalyse?"];
    const result = analyzeTranscriptPhases(messages.flatMap((message) => [
      { role: "agent", message: ROLEPLAY_START_MARKER },
      { role: "user", message },
      { role: "agent", message: ROLEPLAY_END_MARKER },
    ]));
    expect(result).toMatchObject({ status: "recognized", reason: null, roleplayUserMessages: messages });
  });

  it("splits multiple exercises and coaching within the same agent turn without losing text", () => {
    const message = `Vorbereitung. ${ROLEPLAY_START_MARKER} Kunde eins. ${ROLEPLAY_END_MARKER} Zwischenfeedback. ${ROLEPLAY_START_MARKER} Kunde zwei. ${ROLEPLAY_END_MARKER} Lernziel.`;
    const result = analyzeTranscriptPhases([{ role: "agent", message }]);
    expect(result.status).toBe("recognized");
    expect(result.segments.map((segment) => segment.phase))
      .toEqual(["coach_intro", "roleplay", "coach_debrief", "roleplay", "coach_debrief"]);
    expect(result.segments[2].message).toContain("Zwischenfeedback.");
    expect(result.segments.map((segment) => segment.message).join("")).toBe(message);
  });

  it("preserves completed exercises when a later exercise never ends", () => {
    const result = analyzeTranscriptPhases([
      ...twoRoleplays.slice(0, 4),
      { role: "agent", message: ROLEPLAY_START_MARKER },
      { role: "user", message: secondEvidence },
    ]);
    expect(result).toMatchObject({ status: "partial", roleplayUserMessages: [firstEvidence] });
    expect(result.reason).toBeTruthy();
    expect(result.segments.find((segment) => segment.message === secondEvidence)?.phase).not.toBe("roleplay");
  });

  it("excludes a nested exercise while preserving independent completed exercises", () => {
    const result = analyzeTranscriptPhases([
      ...twoRoleplays.slice(0, 4),
      { role: "agent", message: ROLEPLAY_START_MARKER },
      { role: "user", message: "Unsicherer Beitrag vor dem verschachtelten Start." },
      { role: "agent", message: ROLEPLAY_START_MARKER },
      { role: "user", message: "Unsicherer Beitrag nach dem verschachtelten Start." },
      { role: "agent", message: ROLEPLAY_END_MARKER },
      ...twoRoleplays.slice(6),
    ]);
    expect(result).toMatchObject({ status: "partial", roleplayUserMessages: [firstEvidence, secondEvidence] });
  });

  it.each(["before", "after"])("flags an orphan end %s a safe exercise without discarding that exercise", (position) => {
    const orphan = { role: "agent", message: ROLEPLAY_END_MARKER };
    const exercise = twoRoleplays.slice(0, 4);
    const result = analyzeTranscriptPhases(position === "before" ? [orphan, ...exercise] : [...exercise, orphan]);
    expect(result).toMatchObject({ status: "partial", roleplayUserMessages: [firstEvidence] });
  });

  it.each([
    { transcript: [] },
    { transcript: [{ role: "user", message: firstEvidence }] },
    { transcript: [{ role: "agent", message: ROLEPLAY_END_MARKER }] },
  ])(
    "never produces evidence without a complete agent-marked pair: $transcript", ({ transcript }) => {
      const result = analyzeTranscriptPhases(transcript);
      expect(["missing", "ambiguous"]).toContain(result.status);
      expect(result.roleplayUserMessages).toEqual([]);
    },
  );

  it("ignores markers spoken by the user", () => {
    expect(analyzeTranscriptPhases([
      { role: "user", message: ROLEPLAY_START_MARKER },
      { role: "user", message: firstEvidence },
      { role: "user", message: ROLEPLAY_END_MARKER },
    ])).toMatchObject({ status: "missing", roleplayUserMessages: [] });
  });

  it.each(["–", "—", "-"])("keeps case-insensitive markers and the %s end separator", (dash) => {
    const result = analyzeTranscriptPhases([
      { role: "agent", message: "ROLLENSPIEL BEGINNT." },
      { role: "user", message: firstEvidence },
      { role: "agent", message: `rollenspiel beendet  ${dash}  zurück im coach-modus.` },
    ]);
    expect(result).toMatchObject({ status: "recognized", roleplayUserMessages: [firstEvidence] });
  });

  it("supports a legacy exercise after an exact start and deduplicates legacy wording in the same turn", () => {
    const result = analyzeTranscriptPhases([
      ...twoRoleplays.slice(0, 4),
      { role: "agent", message: "Du rufst jetzt an. Telefon klingelt." },
      { role: "user", message: secondEvidence },
      { role: "agent", message: ROLEPLAY_END_MARKER },
    ]);
    expect(result).toMatchObject({ status: "recognized", roleplayUserMessages: [firstEvidence, secondEvidence] });
  });

  it("prefers the exact start over accompanying legacy wording in that turn", () => {
    const result = analyzeTranscriptPhases([
      { role: "agent", message: `${ROLEPLAY_START_MARKER} Du rufst jetzt an. Telefon klingelt.` },
      { role: "user", message: firstEvidence },
      { role: "agent", message: ROLEPLAY_END_MARKER },
    ]);
    expect(result).toMatchObject({ status: "recognized", roleplayUserMessages: [firstEvidence] });
  });
});
