# Mehrere Rollenspiele innerhalb einer Session

## Ursache und Korrektur

Der bisherige Parser akzeptierte genau ein Start-/Endmarker-Paar. Zwei korrekt
abgeschlossene Rollenspiele mit Zwischenfeedback galten deshalb als `ambiguous`.
Die Bewertungsvalidierung entfernte daraufhin Scores, Begründungen, Belege und
Verbesserungen. Der Webhook speicherte die Session trotzdem als abgeschlossen,
jedoch ohne Lernziel, weil kein gültiger Score mehr vorhanden war.

Die Phasenerkennung verarbeitet jetzt Marker in chronologischer Reihenfolge,
einschließlich ihrer Zeichenposition innerhalb eines Transkriptbeitrags. Jeder
eindeutig abgeschlossene Abschnitt wird separat segmentiert. Texte zwischen
Rollenspielen bleiben Coaching. Der Startmarker gehört zur vorherigen Coachphase,
der Endmarker zur folgenden Coachphase. Marker werden nur in Agentbeiträgen erkannt.

Die Bewertungen bleiben die vom Provider gelieferten **Sessionbewertungen**.
Es werden weder Durchlaufbewertungen noch neue Mittelwerte oder ein erfolgreicher
zweiter Versuch abgeleitet. Nutzerbelege dürfen aus jedem sicheren Abschnitt
stammen. Bestehende Prüfungen für Score, individuelle Begründung und belegte
Verbesserung bleiben aktiv.

## Regeln für Markerfolgen

| Verlauf | Status | Nutzbare Belege |
| --- | --- | --- |
| Ein oder mehrere korrekt abgeschlossene Rollenspiele | `recognized` | Nutzerbeiträge aller dieser Abschnitte |
| Abgeschlossene Abschnitte und ein später offener Versuch | `partial` | Nur die abgeschlossenen Abschnitte |
| Verschachtelte Starts mit unabhängigen sicheren Abschnitten | `partial` | Nur die unabhängigen Abschnitte; der verschachtelte Abschnitt entfällt vollständig |
| Verwaiste oder doppelte Endmarker neben sicheren Abschnitten | `partial` | Nur die sicheren Abschnitte |
| Keine vollständigen Abschnitte, fehlende Grenzen | `missing` | Keine |
| Keine sicheren Abschnitte, widersprüchliche Markerfolge | `ambiguous` | Keine |

Ein verschachtelter Start macht den offenen Abschnitt rückwirkend unsicher.
Nach einem Endmarker kann ein neues unabhängiges Paar erkannt werden. Ohne Ende
liefert ein offener Abschnitt keine Belege. Unsichere Texte werden in der Anzeige
außerhalb der Rollenspielphase geführt; die Anzeige erläutert `partial` ausdrücklich.

Groß-/Kleinschreibung und die bisherigen Bindestrichvarianten bleiben unterstützt.
Legacy-Starts (`Du rufst jetzt an`, `Telefon klingelt`) bleiben ebenfalls gültig,
auch für spätere Übungen nach einem exakten Startmarker. Beide Legacy-Formulierungen
im selben Beitrag zählen zusammen als ein Start. Ein exakter Startmarker hat in
seinem Beitrag Vorrang vor begleitender Legacy-Formulierung.

## Providerdaten und Lernziel

Die Extraktion liest weiterhin kriterienspezifische `_feedback`, `_evidence` und
`_improvement`-Felder. Ein Lernziel aus `session_conclusion.next_learning_goal`
hat Vorrang vor dem separaten Feld `next_learning_goal`. Das Datenmodell erwartet
hier einen Text, kein Lernzielobjekt. Objekt-, JSON- und umschlossene JSON-Formate
für die übergeordneten strukturierten Analysefelder bleiben unterstützt.

Ein geliefertes deutsches Lernziel wird nur bei auswertbaren Abschnitten und
mindestens einem gültigen Score übernommen. Fehlende, ungültige oder als englisch
erkannte Lernziele bleiben `null`; der bisherige Ersatz aus dem schwächsten
Kriterium entfällt. Fehlende Begründungen oder Belege werden nicht ergänzt.
Damit sind fehlende Providerdaten von fehlenden sicheren Phasen unterscheidbar:
Gültige Phasen allein erzeugen keine Bewertungen oder Lernziele.

Die bestehende Zusammenfassungs-, Stärken- und Lernprofilableitung wird durch
diesen Fix nicht fachlich neu definiert. Insbesondere sind allgemeine
Lernprofilempfehlungen keine nachträglich rekonstruierten Provider-Lernziele.

## Lokale Regressionstests

`tests/transcript-phases.test.ts` prüft einzelne, zwei und drei Übungen,
Zwischenfeedback, gemischte Marker-/Dialogbeiträge, fehlende und widersprüchliche
Marker, Teilverläufe und Legacy-/Schreibvarianten.
`tests/evaluation-integrity.test.ts` prüft Belege aus verschiedenen Übungen und
verwirft Coachingbeiträge, Agentvorschläge und unvollständige Versuche.

`tests/roleplay-webhook.test.ts` führt den echten Handler mit echter Extraktion,
Phasenerkennung und Bewertungsvalidierung aus. Signaturprüfung, Konfiguration,
Datenbank-RPCs sind gemockt; Netzwerkzugriffe sind gesperrt.
Der zentrale Test prüft die gespeicherten Session-Scores, individuellen
Begründungen, Belege, Verbesserungen und das Provider-Lernziel bei zwei Übungen.
Weitere Fälle prüfen Teilverläufe, fehlende Providerdaten, identische Duplikate,
abweichende Payloads und eine unpassende Agentbindung.

Die separaten Analyse- und Sprachtests prüfen beide Lernzielpfade und das
Ausbleiben erfundener Ersatzfelder. Der bestehende Backfill-Quelltexttest akzeptiert
jetzt LF- und CRLF-Zeilenenden, damit die lokale Gesamtsuite unter Windows läuft.

## Bereits betroffene Sessions kontrolliert neu auswerten

Dieser Fix ändert keine vorhandenen Daten. Ein erneutes Senden an den Webhook
ist kein Reprocessing-Verfahren: Identische Payloads bleiben Duplikate;
abweichende Payloads derselben Conversation-ID bleiben Konflikte (HTTP 409).
Diese Sicherung wird nicht umgangen.

Seit Paket D verwendet `scripts/recover-elevenlabs-sessions.mts` dieselbe fachliche
Verarbeitung wie der Webhook. `--preview` erstellt f?r genau eine explizite
Conversation einen gespeicherten Plan; `--apply` verarbeitet ausschlie?lich diesen
Plan und pr?ft die erwartete Sessionrevision in derselben Datenbanktransaktion.
Abgeschlossene Sessions bleiben gesch?tzt. Nicht abgeschlossene Sessions ben?tigen
einen beim Provider best?tigten Abschluss und die verifizierte Zuordnung aus Paket C.
Details und Befehle: [Korrekturprotokoll Paket D](Korrekturprotokoll_2026-10-20_Paket_D.md).
Das Werkzeug wurde in diesem Durchlauf nur mit synthetischen Daten getestet.

F?r eine fachliche Neubewertung bereits abgeschlossener historischer Sessions ist
weiterhin ein gesonderter Reparaturauftrag n?tig. Das Recovery-Werkzeug bietet
bewusst keinen pauschalen ?berschreibschalter. Auch das Cleanup-Skript kann bereits
verworfene Providerbewertungen nicht rekonstruieren.

Ein gesondert freizugebender Reparaturlauf sollte:

1. Betroffene Session- und Conversation-IDs explizit erlauben und aktuelle
   Datenbankstände einschließlich Zeitstempeln und Lernprofilen sichern.
2. Den ursprünglichen Analysepayload aus einer autorisierten Quelle sichern;
   fehlen diese Providerdaten, keine Scores oder Lernziele rekonstruieren.
3. Die neue Verarbeitung zuerst offline gegen Kopien ausführen und pro Feld einen
   Vorher-/Nachher-Diff zur Prüfung vorlegen.
4. Erst nach Freigabe mit Versions-/Concurrencyprüfung und nachvollziehbarem
   Auditprotokoll gezielt aktualisieren; ursprüngliche Sessionzeitpunkte erhalten.
5. Danach die betroffenen Lernprofile kontrolliert neu berechnen und Ergebnisse
   mit dem freigegebenen Diff vergleichen.

Webhook-Receipts werden dabei weder gelöscht noch pauschal zurückgesetzt.
Die hier beschriebenen Produktionsschritte wurden nicht ausgeführt.
