import { createClient } from "@supabase/supabase-js";

const TARGET_EMAIL = "christian.weiss@igz.com";

type Improvement = {
  criterionId: string;
  score: number;
  recommendation: string;
  alternative: string;
  evidence: string;
  priority: number | null;
};

type BackfillSession = {
  summary: string;
  improvements: Improvement[];
};

const sessions: Record<string, BackfillSession> = {
  "e5043d6e-ba07-4305-a9a0-15c7a529c23d": {
    summary: "Im Rollenspiel zur Einladung zu den Innovation Days hast du die Veranstaltung und ihren grundsätzlichen Nutzen ausführlich erklärt. Der konkrete Kundennutzen und die Bedarfsermittlung blieben jedoch zu allgemein; beim Abschluss entstand durch den Early-Bird-Hinweis unnötiger Druck.",
    improvements: [
      {
        criterionId: "21000000-0000-0000-0000-000000000001",
        score: 1,
        recommendation: "Den Einstieg direkt mit Anlass und möglichem Kundenwert eröffnen, statt zuerst um unspezifisch „kurz Zeit“ zu bitten.",
        alternative: "Ich rufe an, weil unsere Innovation Days am 13. und 14. Oktober konkrete Praxisimpulse zu EWM-Stabilität bieten – darf ich kurz einordnen, was davon für Sie relevant sein könnte?",
        evidence: "Ja, hallo Herr Müller, hier ist die Frau Gaffron von der IGZ. Haben Sie geradekurz Zeit?",
        priority: 1,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000002",
        score: 1,
        recommendation: "Mit einer offenen Frage die aktuelle Logistiksituation erkunden, bevor du Inhalte der Veranstaltung präsentierst.",
        alternative: "Welche Themen beschäftigen Sie aktuell in Ihrer EWM-Logistik am stärksten?",
        evidence: "Sie ham bestimmt auch, ähm, EWM in Ihrer Logistik im Einsatz, oder?",
        priority: 2,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000003",
        score: 2,
        recommendation: "Den Nutzen aus dem konkreten Kundenproblem ableiten und den Preis erst transparent einordnen, wenn Relevanz geklärt ist.",
        alternative: "Wenn Stabilität für Sie relevant ist, zeige ich Ihnen gern die zwei Agenda-Punkte, in denen andere EWM-Anwender genau dazu ihre Erfahrungen teilen.",
        evidence: "Ich möchte keinen Druck machen, aber aktuell würden Sie auch noch bei, äh, bei der Anmeldung von unserem Early-Bird-Rabatt profitieren.",
        priority: null,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000004",
        score: 3,
        recommendation: "Den Einwand zum bestehenden Dienstleister zuerst mit einer Rückfrage vertiefen, statt unmittelbar einen Vergleich vorzuschlagen.",
        alternative: "Welche Aufgaben deckt Ihr bestehender Partner bereits gut ab, und wo wünschen Sie sich zusätzliche Praxisimpulse?",
        evidence: "Genau deswegen wär es noch besser, wenn Sie unsere Innovation Days besuchen, so können Sie die Funktionen und die Hilfestellungen Ihres Dienstleisters mit unseren Lösungen vergleichen und so das Beste für Sie und Ihr Unternehmen rausholen.",
        priority: null,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000005",
        score: 1,
        recommendation: "Einen akzeptierten, druckfreien nächsten Schritt vereinbaren und den klar abgelehnten Rückruf respektieren.",
        alternative: "Ich sende Ihnen die Agenda heute zu. Wenn ein Thema passt, antworten Sie mir einfach kurz – dann klären wir gezielt die offenen Fragen.",
        evidence: "Okay, Herr Müller, ich schi..., äh, schicke Ihnen nachher gleich die Agenda zu und danach würde ich vorschlagen, ich melde mich am Freitag noch mal, da Sie sonst, wie gesagt, vielleicht nicht mehr den Early-Bird-Rabatt nutzen könnten.",
        priority: 3,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000006",
        score: 2,
        recommendation: "Lange Aufzählungen auf einen klaren Nutzenpunkt und eine anschließende Frage reduzieren.",
        alternative: "Sie sehen dort konkrete EWM-Praxisbeispiele zur Prozessstabilität. Welcher Bereich wäre für Sie dabei besonders relevant?",
        evidence: "Sie können sich angucken, wie andere Unternehmen mit den gängigen Problemen in ihrer Logistik umgehen, was es für Best-Practice-Lösungen gibt, was wir als EGZ ident für Lösungen anbieten können, um ganz normale Probleme im Alltag vielleicht besser zu bearbeiten, um, ja, die ganzen Prozesse effizienter zu gestalten.",
        priority: null,
      },
    ],
  },
  "d45f3022-3e8f-49ad-b1c1-fedb6bd47f04": {
    summary: "Im Gespräch zur Einladung zu den Innovation Days hast du den Bezug zur laufenden S/4-Migration grundsätzlich hergestellt. Wechselnde Namen und Firmenangaben sowie das Beharren auf einem nicht bestätigten Vorgespräch schwächten die Glaubwürdigkeit; Nutzen und Abschluss sollten klarer und kundenzentrierter werden.",
    improvements: [
      {
        criterionId: "21000000-0000-0000-0000-000000000001",
        score: 3,
        recommendation: "Name, Unternehmen und Anlass vom ersten Satz an konsistent und wahrheitsgemäß nennen.",
        alternative: "Guten Tag, Ann-Kathrin Brucker von der IGZ. Ich möchte Herrn Müller zu unseren Innovation Days im Oktober sprechen.",
        evidence: "Ja, hallo, Ann-Kathrin Röcker von der IGZ. Ich würd gern mit Herrn Müller sprechen. Können Sie mich da verbinden, bitte?",
        priority: null,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000002",
        score: 1,
        recommendation: "Die bekannte Projektsituation mit einer offenen Bedarfsfrage konkretisieren, statt Interesse oder Vorwissen vorauszusetzen.",
        alternative: "Welche Themen binden Ihr Team in der S/4-Migration aktuell am stärksten?",
        evidence: "Das hat er mir auch schon gesagt, dass sie momentan ein großes Projekt am Laufen haben und deswegen zeitlich gebunden sind.",
        priority: null,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000003",
        score: 3,
        recommendation: "Den Veranstaltungsnutzen konkret mit der S/4-Migration verbinden, statt Preis und Verpflegung zu rechtfertigen.",
        alternative: "Ein Praxisvortrag zeigt konkret, wie ein Unternehmen typische Risiken seiner S/4-Migration gelöst hat – wäre dieser Erfahrungsaustausch für Ihr Projekt hilfreich?",
        evidence: "Das mag jetzt im ersten Moment vielleicht etwas viel klingen. Es ist eine zweitägige Veranstaltung. Die Kosten für Getränke und Verpflegung sind natürlich bereits inbegriffen.",
        priority: 2,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000004",
        score: 3,
        recommendation: "Den Seriositätseinwand anerkennen und den belegbaren Sachstand korrigieren, statt die eigene Darstellung erneut zu behaupten.",
        alternative: "Sie haben recht, ich formuliere es sauber: Wir hatten noch keinen bestätigten Termin. Ich sende Ihnen die Agenda, damit Sie die Relevanz selbst prüfen können.",
        evidence: "Ich möchte aber noch mal betonen, dass es sich dabei nicht um eine Verkaufsveranstaltung handelt. Es ist rein informativ.",
        priority: null,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000005",
        score: 2,
        recommendation: "Den ausdrücklich abgelehnten Rückruf akzeptieren und einen selbstbestimmten nächsten Schritt anbieten.",
        alternative: "Verstanden. Ich sende Ihnen die Agenda; wenn ein Thema passt, erreichen Sie mich direkt über die Mail.",
        evidence: "Super, Herr Mueller. Dann würd ich mich aber trotzdem am 10. August noch mal bei Ihnen rückmelden, dass Sie auch den Early-Bird-Rabatt noch mal mitnehmen könnten, sollten Sie Interesse haben.",
        priority: 3,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000006",
        score: 2,
        recommendation: "Bei Namen, Firma und Vorgespräch sprachlich eindeutig bleiben und Unsicherheiten sofort sachlich korrigieren.",
        alternative: "Hier ist Ann-Kathrin Brucker von der IGZ. Wir hatten noch keinen Termin; ich rufe wegen unserer Innovation Days an.",
        evidence: "Dass, ähm, telefonisch Frau Brucker von der INZ ist und dass wir letzte Woche bereits telefoniert hatten, haben, äh, bezüglich unseren Innovation Days und dass ich jetzt, wie vereinbart, zurückrufe.",
        priority: 1,
      },
    ],
  },
  "4394a097-104d-4565-833e-ac1f9ed3fb1b": {
    summary: "Du hast die Innovation Days mit SAP-EWM-Inhalten, Praxisbeispielen und Networking grundsätzlich relevant beschrieben. Unsicherheiten und Versprecher machten die Einwandbehandlung und den Abschluss jedoch weniger klar; offene Bedarfsfragen hätten den Kundennutzen genauer erschlossen.",
    improvements: [
      {
        criterionId: "21000000-0000-0000-0000-000000000002",
        score: 3,
        recommendation: "Nach dem EWM-Einsatz offen nach der konkreten Situation fragen, statt direkt in die Veranstaltungsbeschreibung zu wechseln.",
        alternative: "Welche EWM-Themen sind im Rahmen Ihres S/4-Projekts derzeit besonders anspruchsvoll?",
        evidence: "Haben Sie SAP EWM im Einsatz?",
        priority: null,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000004",
        score: 2,
        recommendation: "Den Zeit- und Relevanzeinwand zuerst klären und nur den dazu passenden Nutzen anbieten.",
        alternative: "Verstanden, Ihre Zeit ist knapp. Welcher Aspekt der S/4-Migration kostet Ihr Team aktuell am meisten Aufwand?",
        evidence: "Wir könnten Sie auch mit dem Kunden noch mal zusammenschalten und ich denk, der könnt Ihnen 'nen eigenen Erfahrungswert mitgeben. Wie klingt das?",
        priority: 2,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000005",
        score: 2,
        recommendation: "Den nächsten Schritt klar, positiv und ohne missverständliche Formulierung abschließen.",
        alternative: "Ich sende Ihnen die Agenda heute zu. Wenn Fragen entstehen, melden Sie sich gern direkt bei mir.",
        evidence: "Okay. Eine Bitte noch: Wenn Sie sich die Agenda gut durchlesen und Fragen haben, bitte melden Sie sie ungern bei mir.",
        priority: 3,
      },
      {
        criterionId: "21000000-0000-0000-0000-000000000006",
        score: 2,
        recommendation: "Bei einem Hänger kurz neu ansetzen und die Kernaussage in einem klaren Satz formulieren.",
        alternative: "Der Anlass meines Anrufs sind unsere Innovation Days im Oktober mit konkreten Praxisbeispielen für SAP-Logistik.",
        evidence: "Und, äh, jetzt hab ich den Faden verloren.",
        priority: 1,
      },
    ],
  },
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
if (!url || !key) throw new Error("Supabase server configuration is missing.");

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authError) throw authError;
const targets = authData.users.filter((user) => user.email?.toLowerCase() === TARGET_EMAIL);
if (targets.length !== 1) throw new Error(`Expected one target user, found ${targets.length}.`);
const targetUserId = targets[0].id;

const sessionIds = Object.keys(sessions);
const { data: before, error: beforeError } = await supabase
  .from("coaching_sessions")
  .select("id,user_id,completed_at,summary,transcript,session_evaluations(criterion_id,score)")
  .eq("user_id", targetUserId)
  .in("id", sessionIds);
if (beforeError) throw beforeError;
if (before.length !== sessionIds.length) throw new Error(`Expected ${sessionIds.length} sessions, found ${before.length}.`);

const transcriptSnapshots = new Map(before.map((session) => [session.id, JSON.stringify(session.transcript)]));
const scoreSnapshots = new Map(before.map((session) => [
  session.id,
  [...session.session_evaluations]
    .sort((a, b) => a.criterion_id.localeCompare(b.criterion_id))
    .map(({ criterion_id, score }) => `${criterion_id}:${score}`)
    .join("|"),
]));

for (const session of before) {
  if (!session.completed_at?.startsWith("2026-07-29")) throw new Error(`Session ${session.id} is outside the approved date.`);
  const backfill = sessions[session.id];
  const lowScores = session.session_evaluations.filter((evaluation) => (
    evaluation.score !== null && evaluation.score >= 1 && evaluation.score <= 3
  ));
  if (lowScores.length !== backfill.improvements.length) {
    throw new Error(`Low-score count changed for session ${session.id}.`);
  }

  const { error: summaryError } = await supabase
    .from("coaching_sessions")
    .update({ summary: backfill.summary })
    .eq("id", session.id)
    .eq("user_id", targetUserId);
  if (summaryError) throw summaryError;

  for (const improvement of backfill.improvements) {
    const { error: updateError } = await supabase
      .from("session_evaluations")
      .update({
        recommendation: improvement.recommendation,
        alternative_formulation: improvement.alternative,
        improvement_evidence: improvement.evidence,
        improvement_priority: improvement.priority,
      })
      .eq("session_id", session.id)
      .eq("criterion_id", improvement.criterionId)
      .eq("score", improvement.score);
    if (updateError) throw updateError;
  }
}

const { data: after, error: afterError } = await supabase
  .from("coaching_sessions")
  .select("id,summary,transcript,session_evaluations(criterion_id,score,recommendation,alternative_formulation,improvement_evidence)")
  .in("id", sessionIds);
if (afterError) throw afterError;

let improvementCount = 0;
for (const session of after) {
  if (JSON.stringify(session.transcript) !== transcriptSnapshots.get(session.id)) {
    throw new Error(`Transcript changed for session ${session.id}.`);
  }
  const scores = session.session_evaluations
    .sort((a, b) => a.criterion_id.localeCompare(b.criterion_id))
    .map(({ criterion_id, score }) => `${criterion_id}:${score}`)
    .join("|");
  if (scores !== scoreSnapshots.get(session.id)) throw new Error(`Scores changed for session ${session.id}.`);
  if (session.summary !== sessions[session.id].summary) throw new Error(`Summary verification failed for ${session.id}.`);
  improvementCount += session.session_evaluations.filter((evaluation) => (
    evaluation.recommendation
    && evaluation.alternative_formulation
    && evaluation.improvement_evidence
  )).length;
}

if (improvementCount !== 16) throw new Error(`Expected 16 complete improvements, found ${improvementCount}.`);
console.log("Backfill verified: 3 German summaries, 16 evidenced improvements, unchanged scores and transcripts.");
