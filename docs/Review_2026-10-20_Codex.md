# Unabhängiger Multi-Agent Code Review

- **Review-Datum:** 2026-10-20
- **Agent:** Codex (OpenAI)
- **Projekt:** Ossi – AI Sales Coach V2 (`ossi-voice-coach`)
- **Methode:** Ausschließlich statische, lokale Analyse durch vier eigenständige Review-Subagenten und anschließende Prüfung und Konsolidierung durch den Hauptagenten.
- **Prüfstand:** Lokaler Arbeitsstand zum Zeitpunkt des Reviews, einschließlich der bereits vorhandenen uncommitteten Änderungen.
- **Review-Perspektiven:** Architektur; Codequalität und Logik; Security; Tests, Zuverlässigkeit und Performance.

> Diese Datei dokumentiert den zuvor im Chat abgeschlossenen Review. Während der Analyse wurden keine Projektdateien verändert, keine Tests oder Builds ausgeführt und keine externen Systeme aufgerufen. Die Erstellung dieser Markdown-Datei erfolgte anschließend auf ausdrücklichen Wunsch des Nutzers. Die empfohlenen Korrekturen wurden nicht umgesetzt.

Das Projekt besitzt eine brauchbare technische Grundlage, ist aus Sicht des Reviews aber noch nicht ausreichend robust für einen uneingeschränkten Produktivbetrieb. Die größten Schwächen betreffen die Wiederaufnahme unterbrochener Webhooks, umgehbare Session-Limits, die Verlässlichkeit von Bewertungsbelegen und das Agenten-Releaseverfahren.

Alle vier Review-Perspektiven wurden durch eigenständige Subagenten abgedeckt. Die wesentlichen Findings wurden anschließend durch den Hauptagenten selbst am Quellcode überprüft und zusammengeführt.

## A. Executive Summary

| Bereich | Bewertung | Begründung |
|---|---:|---|
| Gesamtqualität | **6/10** | Gute Grundlagen und erkennbare fachliche Sorgfalt; relevante Lücken bei Fehlerbehandlung und Datenkonsistenz. |
| Architektur | **6/10** | Sinnvolle Modulaufteilung, aber zentrale Abläufe bestehen aus mehreren ungesicherten Datenbankoperationen. |
| Codequalität | **7/10** | Ausgelagerte Fachlogik, TypeScript und Validierungen; einzelne nachvollziehbare Logikfehler und unvollständige Fehlerpfade. |
| Security | **6/10** | RLS, Rollenprüfungen, HMAC und eingeschränkte Schreibrechte sind positiv. Session-Limits und Conversation-Zuordnung benötigen Nacharbeit. |
| Testqualität | **6/10** | Gute Fachlogiktests und echte Integrationsskripte vorhanden; wichtige Fehler-, Parallelitäts- und SQL-Szenarien fehlen. |
| Wartbarkeit | **6/10** | Dokumentation und Struktur helfen. Unvollständige Versionierung und mehrfach implementierte Verarbeitung erhöhen Änderungsrisiken. |

**Produktionsreife:** Für einen kontrollierten Pilotbetrieb grundsätzlich geeignet, sofern Einschränkungen bewusst akzeptiert und Fehler überwacht werden. Vor breiterem Einsatz sollten die nachfolgenden P1-Befunde behoben und die Lösch-/Aufbewahrungsregeln geklärt werden. Eine vollständige Neuentwicklung ist nicht erforderlich.

Die Bewertungen beruhen auf statischer Analyse, nicht auf gemessener Testabdeckung oder aktuell ausgeführten Tests. **Ein P0-Befund wurde nicht nachgewiesen.**

## B. Priorisierte Findings

Alle Dateiangaben und Zeilennummern beziehen sich auf den geprüften Stand unter `ossi-voice-coach/`. Die Links sind relativ zu dieser Review-Datei. Zeilennummern können sich durch spätere Änderungen verschieben.

Prioritäten:

- **P0:** Kritisch / unmittelbares Risiko.
- **P1:** Hoch / vor Produktiveinsatz beheben.
- **P2:** Mittel / sinnvoll verbessern.
- **P3:** Niedrig / Optimierung.

Bedingte Risiken sind ausdrücklich gekennzeichnet.

| ID | Priorität | Kategorie | Datei / Zeile | Problem | Empfehlung |
|---|---|---|---|---|---|
| R01 | **P1** | Security / Kostenkontrolle | [Sessionstart](../app/api/sessions/start/route.ts), Zeile 49; [Sessionlöschung](../app/api/sessions/[id]/route.ts), Zeile 21 | Löschen eigener Sessions umgeht Stundenlimit und Sperre paralleler Sessions. | Startzähler unabhängig von löschbaren Sessions führen; aktive Calls kontrolliert beenden. |
| R02 | **P1** | Zuverlässigkeit | [Receipt-Claim](../supabase/migrations/20260719210605_init_coaching_platform.sql), Zeile 271; [Webhook](../app/api/webhooks/elevenlabs/route.ts), Zeile 83 | Abgebrochene Verarbeitung kann dauerhaft als erfolgreiches Duplikat quittiert werden. | Zeitlich begrenzte Claims und sichere Wiederaufnahme implementieren. |
| R03 | **P1** | Bewertungsintegrität | [Belegvergleich](../lib/coaching/evaluation-integrity.ts), Zeile 42 | Erfundenes längeres Zitat wird akzeptiert, wenn es einen echten Nutzerbeitrag enthält. | Nur tatsächlich im zulässigen Transkript enthaltene Belegtexte akzeptieren. |
| R04 | **P1** | Voice / Fehlerbehandlung | [Conversation-Bindung](../components/training-launcher.tsx), Zeile 113 | Netzwerkfehler beim Bind-Request kann ein laufendes Gespräch ohne gespeicherte Zuordnung hinterlassen. | Callback separat absichern; begrenzte Wiederholung, danach kontrollierter Abbruch. |
| R05 | **P1** | Release-Sicherheit | [Resume-Release](../scripts/elevenlabs-agent-release.mjs), Zeile 470 | Erfolgreicher Testlauf ist nicht an die später veröffentlichte Agentenkonfiguration gebunden. | Unveränderlichen Release-Stand mit Konfigurationshash testen und veröffentlichen. |
| R06 | **P2** | Fehlerbehandlung | [Signed-URL-Abruf](../app/api/sessions/start/route.ts), Zeile 149 | Provider-Ausnahmen lassen eine vorbereitete Session zurück und blockieren weitere Starts bis zu 15 Minuten. | Alle Fehlerpfade nach Sessionanlage kompensieren. |
| R07 | **P2** | Datenkonsistenz | [Neuberechnung](../lib/coaching/recompute.ts), Zeile 65 | Fortschritt und Lernprofile werden nicht atomar ersetzt; konkurrierende Abläufe können veraltete Werte zurückschreiben. | Transaktion und Serialisierung pro Nutzer oder versionierte, wiederholbare Neuberechnung. |
| R08 | **P2** | Skalierung / Korrektheit | [Historienabruf](../lib/coaching/recompute.ts), Zeile 24; [API-Limit](../supabase/config.toml), Zeile 18 | Unpaginierter Abruf berechnet bei Erreichen des API-Limits nur eine Teilhistorie. | Vollständige SQL-Aggregation oder deterministische Pagination. |
| R09 | **P2** | Datenschutz / Datenlebenszyklus | [Bereinigung](../supabase/migrations/20260719210605_init_coaching_platform.sql), Zeile 241; [Provider-Retention](../elevenlabs/agent_configs/Coaching-Kaltakquise-V2.0.json), Zeile 511 | Löschung und Aufbewahrungsfristen erfassen nicht alle Kopien und wörtlichen Belege. | Provider-Kopien und Bewertungsbelege ausdrücklich in das Löschkonzept aufnehmen. |
| R10 | **P2** | Autorisierung, bedingtes Risiko | [Bind-API](../app/api/sessions/[id]/bind/route.ts), Zeile 14 | Eigentümerschaft der Provider-Conversation wird nicht bestätigt. | Conversation an einen serverseitig abgesicherten Session-Bezug binden. |
| R11 | **P2** | Versionierung | [Kriterienauswahl](../app/api/webhooks/elevenlabs/route.ts), Zeile 106; [Kriterien-RLS](../supabase/migrations/20260727070000_optimize_query_paths.sql), Zeile 68 | Sessions sind nicht an ein unveränderliches Kriterien-Set gebunden; historische Kriterien können unsichtbar werden. | Kriterienversion an Trainingsversion/Session binden und historische Lesbarkeit sichern. |
| R12 | **P2** | Tests | [Session-Sicherheitstests](../tests/session-start-security.test.ts), Zeile 19; [Webhook-Mock](../tests/roleplay-webhook.test.ts), Zeile 75 | Quelltextprüfungen und vereinfachte Mocks belegen zentrale Sicherheits- und Wiederanlaufgarantien nicht. | Verhalten bei Fehlern, Parallelität und echten Datenbankzuständen testen. |
| R13 | **P2** | Fachlogik | [Stärkenextraktion](../lib/elevenlabs/analysis.ts), Zeile 81; [Stärkenaufteilung](../lib/coaching/evaluation-integrity.ts), Zeile 76 | Kommas innerhalb formulierter Stärken zerlegen die Inhalte und können echte Einträge verdrängen. | Strukturierte Stärken durchgehend als Array verarbeiten. |

### R01 – Session-Limits sind über die API umgehbar

**Priorität:** P1. **Konfidenz:** hoch.

Ein angemeldeter Nutzer kann wiederholt `Start → eigene Session löschen → Start` ausführen. Der Stundenzähler zählt ausschließlich noch vorhandene Session-Datensätze. Die Löschung entfernt zugleich die Grundlage des Unique-Index für offene Sessions.

Bereits ausgegebene Provider-Zugänge beziehungsweise laufende Verbindungen werden durch die DELETE-Route nicht beendet. Die Agentenkonfiguration setzt zusätzlich keine begrenzte Concurrency. Das ermöglicht mehr kostenpflichtige Gespräche als die Anwendung vorgibt.

**Korrekturstrategie:** Ein unabhängiger, atomarer Startzähler muss auch nach einer Sessionlöschung wirksam bleiben. Aktive Verbindungen benötigen einen kontrollierten Abschluss-/Abbruchprozess. Ein UI-Lock genügt nicht, da die API direkt erreichbar ist.

### R02 – Ein Prozessabbruch kann eine Auswertung dauerhaft festsetzen

**Priorität:** P1. **Konfidenz:** hoch.

Nach dem Claim steht das Receipt auf `processing`. Stirbt die Serverless-Ausführung, wird der Catch-Block nicht mehr erreicht. Spätere Zustellungen werden wegen dieses Status als `duplicate` mit HTTP 200 beantwortet.

Eine Ablaufzeit oder automatische Übernahme verwaister Claims fehlt. Zusätzlich wird der Fehler des abschließenden `finish_webhook_receipt`-Aufrufs nicht ausgewertet. Die vorhandene manuelle Recovery ersetzt keine verlässliche automatische Wiederaufnahme.

**Korrekturstrategie:** Zeitlich begrenzte Claims mit Versuchstoken, sichere Übernahme abgelaufener Claims und wiederholbare Verarbeitung implementieren. HTTP-Erfolg muss tatsächlich abgeschlossene Verarbeitung von lediglich laufender Verarbeitung unterscheiden. Rückgabefehler der abschließenden RPC-Operation prüfen.

### R03 – Die Belegprüfung kann falsche Aussagen legitimieren

**Priorität:** P1. **Konfidenz:** hoch.

Ein echter Nutzerbeitrag lautet beispielsweise:

> Guten Tag, mein Name ist Weiß.

Als angeblicher Beleg wird geliefert:

> Guten Tag, mein Name ist Weiß. Ich garantiere Ihnen 50 Prozent Einsparung.

Die zweite Aussage wurde nie gesprochen. Dennoch akzeptiert der Vergleich den Beleg, weil der längere Kandidat den echten Beitrag enthält. Bei einem gültigen Score und einer eigenständigen ausreichend langen Begründung kann das vollständige falsche Zitat erhalten bleiben.

Das betrifft sowohl Bewertungsbelege als auch Verbesserungsbelege.

**Korrekturstrategie:** Für Zitate muss die Prüfung ausschließlich nachweisen, dass der behauptete Inhalt im zulässigen Nutzertext vorkommt. Vergleichsregeln für Belegnachweis und Begründungsduplikate getrennt behandeln.

### R04 – Bind-Transportfehler wird nicht abgefangen

**Priorität:** P1. **Konfidenz:** hoch.

Der Code behandelt eine HTTP-Fehlerantwort mit `!bind.ok`. Bei einem Netzwerkfehler wirft `fetch` jedoch vorher eine Ausnahme. Der äußere Formular-Catch schützt diesen später ausgeführten asynchronen Callback nicht.

Das Gespräch kann weiterlaufen, obwohl seine Conversation-ID nicht gespeichert wurde; der Webhook findet anschließend keine zugehörige Session.

**Korrekturstrategie:** Ein lokaler Catch mit idempotentem, begrenztem Wiederholungsversuch und anschließendem kontrollierten Abbruch ist erforderlich.

### R05 – Getesteter und veröffentlichter Agent können auseinanderfallen

**Priorität:** P1. **Konfidenz:** hoch.

Kandidat A besteht das Gate. Danach wird die lokale Konfiguration zu B geändert. `release-from-invocation` prüft die Ergebnisse von A, veröffentlicht aber die aktuelle Datei B.

Auch während eines normalen längeren Gate-Laufs kann die Datei zwischen Test und Push verändert werden. Die anschließende Remote-Prüfung vergleicht wiederum mit dem neu eingelesenen lokalen Stand. Zwei nachgelagerte Smokes ersetzen nicht das vollständige Gate für B.

**Korrekturstrategie:** Testnachweis, Konfiguration und Push müssen denselben unveränderlichen Stand referenzieren. Einen Release-Snapshot einschließlich relevanter Agenten- und Testdefinitionen erzeugen, dessen Hash mit Invocation und Ergebnissen speichern und genau diesen Stand veröffentlichen. Resume nur bei nachgewiesener Übereinstimmung zulassen.

### R06 – Startfehler erzeugt eine vermeidbare Sperre

**Priorität:** P2. **Konfidenz:** hoch.

Die Session wird vor dem Abruf der Signed URL angelegt. Nur eine erhaltene HTTP-Fehlerantwort setzt sie auf `failed`. Netzwerkfehler, ungültiges JSON oder eine schemawidrige erfolgreiche Antwort lassen sie auf `created`.

Der nächste Start scheitert deshalb mit `session_already_open`, bis die 15-Minuten-Bereinigung greift. Auch SDK-Verbindungsfehler setzen im Frontend lediglich einen Fehlertext. Ein expliziter, serverseitig geprüfter Abbruchpfad fehlt.

**Korrekturstrategie:** Den gesamten Abschnitt nach erfolgreicher Sessionanlage mit sessionbezogener Fehlerbehandlung absichern, Provider-Aufrufe zeitlich begrenzen und die noch vorbereitete Session bei Fehlschlag kontrolliert schließen.

### R07 – Teilfehler und Konkurrenz können Lernstände verfälschen

**Priorität:** P2. **Konfidenz:** hoch.

Die Neuberechnung liest zunächst einen Datenstand, löscht den bisherigen Fortschritt und schreibt Fortschritt sowie Lernprofile anschließend separat. Ein Schreibfehler kann leeren Fortschritt neben alten Lernprofilen hinterlassen.

Konkurrieren eine Sessionlöschung und ein Webhook, kann eine ältere Berechnung nach einer neueren schreiben. Beim DELETE ist die Session dann bereits entfernt; eine Wiederholung erhält 404 und repariert den Lernstand nicht.

**Korrekturstrategie:** Diese Operationen benötigen eine transaktionale oder zuverlässig versionierte Ausführung. Aggregation und Ersetzung pro Nutzer serialisieren. Eine notwendige Reparatur muss unabhängig von einer bereits gelöschten Session erneut startbar sein.

### R08 – Größere Historien werden unvollständig ausgewertet

**Priorität:** P2. **Konfidenz:** hoch für die versionierte Konfiguration.

Die lokale Supabase-Konfiguration begrenzt Antworten auf 1.000 Zeilen. Bei sechs gültigen Kriterienbewertungen pro Session wird diese Grenze während der **167. Session** überschritten.

Die Berechnung behandelt den unpaginierten Ausschnitt dennoch als vollständige Historie. Anzahl, Durchschnitt, letzter Score und Trend können falsch werden. Ohne Sortierung ist nicht einmal festgelegt, welcher Ausschnitt verwendet wird.

Die tatsächliche produktive API-Grenze wurde nicht geprüft.

**Korrekturstrategie:** Vollständige SQL-Aggregation oder deterministische Pagination verwenden. Die zuletzt benötigten Werte für Trend und jüngsten Score ausdrücklich bestimmen und die Vollständigkeit vor dem Ersetzen abgeleiteter Ergebnisse absichern.

### R09 – Die Datenlebenszyklen sind nicht durchgängig umgesetzt

**Priorität:** P2. **Konfidenz:** hoch für den lokalen Code.

Zwei konkrete Abweichungen:

- Session- und Nutzerlöschung entfernen lokale Supabase-Daten. Die dokumentierte und konfigurierte 30-Tage-Kopie bei ElevenLabs wird nicht zur Löschung beauftragt, obwohl die Oberfläche eine vollständige Sessionlöschung beschreibt.
- Die Zwölfmonatsbereinigung setzt ausschließlich `transcript` auf `null`. Wörtliche Inhalte in `evidence` und `improvement_evidence` bleiben gespeichert.

Das ist eine technische Diskrepanz, kein rechtliches Urteil. Die tatsächliche Remote-Konfiguration wurde nicht geprüft.

**Korrekturstrategie:** Die gewünschte Aufbewahrung ausdrücklich definieren und in allen betroffenen Feldern und Systemen umsetzen. Provider-Löschaufträge müssen wiederholbar sein und ihre Zuordnung bis zum bestätigten Abschluss behalten. Beim Bereinigen von Belegen sind die bestehenden Bewertungsconstraints zu berücksichtigen. Falls bestimmte Kopien bewusst länger bestehen sollen, müssen Nutzerinformation und Löschbestätigung deren tatsächliche Reichweite benennen.

### R10 – Fremde Conversation-Zuordnung ist unter einer zusätzlichen Voraussetzung möglich

**Priorität:** P2. **Konfidenz:** hoch für die fehlende Prüfung, mittel für die praktische Ausnutzbarkeit.

Die Bind-API prüft die eigene lokale Session, akzeptiert aber eine vom Client behauptete Conversation-ID. Kennt jemand eine fremde, noch ungebundene ID und bindet sie zuerst, fehlt eine Prüfung, dass die Provider-Unterhaltung tatsächlich ihm gehört.

Der spätere Webhook prüft den Agenten, nicht die Nutzerherkunft. **Ein Weg zum freien Ermitteln oder Erraten fremder IDs wurde nicht nachgewiesen.** Die fehlende serverseitige Korrelation bleibt dennoch eine relevante Vertrauenslücke.

**Korrekturstrategie:** Die Conversation über einen serverseitig erzeugten, integritätsgeschützten Session-Bezug zuordnen und diesen bei Bindung beziehungsweise Webhook prüfen. Ein bloßer Vergleich ebenfalls clientseitig behaupteter Nutzer-IDs wäre nicht ausreichend.

### R11 – Kriterienwechsel sind historisch nicht sauber abgesichert

**Priorität:** P2. **Konfidenz:** hoch; Auswirkung bei Versionswechsel.

Der Webhook verwendet die aktuell aktiven Kriterien, auch wenn eine Session unter einer früheren Konfiguration gestartet wurde. Ein verspäteter Webhook kann dadurch nach anderen Kriterien verarbeitet werden.

Werden alte Kriterien deaktiviert, verbirgt die RLS sie vor normalen Nutzern; historische Bewertungen verlieren in der Anzeige zugehörige Namen und Sortierung. Die vorhandene `criteria_version` löst dies ohne feste Zuordnung zur Session nicht.

**Korrekturstrategie:** Ein unveränderliches Kriterien-Set an Trainingsversion beziehungsweise Session binden. Historische Lesbarkeit der zur eigenen Session gehörenden Kriterien durch entsprechende Berechtigungen oder einen Snapshot erhalten.

### R12 – Tests prüfen teilweise das Vorhandensein von Schutzcode statt dessen Wirkung

**Priorität:** P2. **Konfidenz:** hoch.

Beispielsweise bestätigt der Rate-Limit-Test bestimmte Zeichenfolgen, erkennt aber den Lösch-Bypass nicht. Der lokale Receipt-Mock kennt Payload-Hashes, bildet jedoch die SQL-Zustände `processing` und `failed` samt Wiederholung nicht realistisch ab.

Solche Prüfungen sind als Zusatz sinnvoll, reichen für die behaupteten Garantien aber nicht aus.

**Korrekturstrategie:** Konkrete Verhaltenstests zu den beschriebenen Fehlersequenzen ergänzen, einschließlich SQL-Ausführung, konkurrierender Operationen und kontrollierter Fehler nach einzelnen Verarbeitungsschritten.

### R13 – Normale Interpunktion beschädigt Stärken

**Priorität:** P2. **Konfidenz:** hoch.

Ein strukturiertes Array wird zunächst mit `", "` verbunden und später wieder an Kommas aufgeteilt. Aus „Du hast offen gefragt, statt vorschnell zu argumentieren“ entstehen zwei Einträge.

Durch die anschließende Begrenzung auf drei Einträge kann eine tatsächlich gelieferte weitere Stärke entfallen.

**Korrekturstrategie:** Strukturierte Daten strukturiert erhalten und nur unstrukturierte Altformate gesondert behandeln. Die Korrektur ist klein und unabhängig von den größeren Architekturmaßnahmen.

## C. Architektur-Review

Der Aufbau als Next.js-Anwendung mit Supabase für Authentifizierung und Datenhaltung sowie ElevenLabs für Voice-Coaching ist für den derzeitigen Umfang angemessen.

Positiv sind insbesondere:

- eigenständige Module für Phasenerkennung, Bewertungsintegrität und Fortschrittsableitung;
- getrennte Browser-, Server- und privilegierte Supabase-Clients;
- zentrale Authentifizierungs- und Rollenprüfungen;
- Datenbankconstraints für wichtige Invarianten;
- Szenario-Snapshots und dokumentierte Verarbeitung mehrerer Rollenspiele.

Die wichtigste strukturelle Schwäche liegt im **Session-Lebenszyklus über mehrere Systeme hinweg**. Browser, Provider, Session-Datensatz, Webhook-Receipt und Lernprofil können unterschiedliche Zustände erreichen. Für Unterbrechungen und Teilfehler fehlt eine durchgängige Wiederherstellungsstrategie.

Daneben werden Teile der Verarbeitung im Webhook und im Recovery-Skript parallel implementiert. Ein gemeinsamer Verarbeitungskern mit getrennten Eingangsadaptern würde Abweichungen reduzieren. Die [Dokumentation zu mehreren Rollenspielen](multiple-roleplays.md) benennt die Grenzen pauschaler Reparaturläufe bereits erfreulich offen.

**Empfehlung:** Die bestehende Anwendung gezielt stabilisieren. Zusätzliche Microservices oder ein umfassender Frameworkwechsel würden die belegten Probleme nicht automatisch lösen.

## D. Test- und Security-Lücken

Die Testsituation ist besser als eine reine Sammlung oberflächlicher Prüfungen: Es gibt Fachlogiktests, einen lokalen Handler-Test, operative Integrationsskripte für Auth/RLS/Sessionabläufe sowie Agentensimulationen. Die reguläre Playwright-Suite konzentriert sich auf drei öffentliche UI-Abläufe in Desktop- und Mobile-Konfiguration.

Die wichtigsten fehlenden Nachweise sind:

- Prozessabbruch nach Webhook-Claim und anschließende Wiederaufnahme;
- gleichzeitige Webhook-Verarbeitung und Sessionlöschung;
- Fehler zwischen Löschen und Neuschreiben der Fortschrittsdaten;
- Session-Limit nach Löschung sowie Bind-Netzwerkfehler;
- Lernprofilberechnung mit mehr als 1.000 Bewertungen;
- Ablehnung eines Releases, dessen Konfiguration vom getesteten Stand abweicht.

Bei Security sind RLS, serverseitige Rollen, HMAC mit Zeitfenster, interne Redirect-Prüfung und begrenzte Webhook-Payloads klar positiv.

Zusätzlich besteht eine **nicht praktisch getestete Prompt-Injection-Vertrauenslücke**: Dynamic Variables kommen aus dem Browser, während `context_collection_instruction` im Prompt als interne Anweisung behandelt wird. Ein veränderter Client kann diese Variable ersetzen. Ein erfolgreicher Angriff wurde nicht nachgewiesen; freie externe Agent-Tools sind in der geprüften Konfiguration nicht vorhanden.

Ein aktueller CVE-Abgleich, ein vollständiger historischer Secret-Scan und die Prüfung tatsächlich deployter Sicherheitskonfigurationen waren wegen des ausdrücklich lokalen Offline-Reviews nicht Bestandteil dieser Untersuchung.

## E. Top-10-Maßnahmen

Die Aufwandsschätzungen sind grobe Entwicklungsschätzungen einschließlich gezielter Regressionstests, keine verbindlichen Zusagen.

| Rang | Maßnahme | Risiko / Nutzen | Aufwand | Abhängigkeit |
|---:|---|---|---|---|
| 1 | Unabhängigen Startzähler und kontrollierten Call-Abbruch einführen | Schließt R01; schützt vor Kosten- und Parallelitätsmissbrauch | 1–3 Tage | Festlegung des Session-Lebenszyklus |
| 2 | Webhook-Claims mit Ablaufzeit und sicherem Reclaim versehen | Verhindert dauerhaft verlorene Auswertungen, R02 | 2–3 Tage | SQL-Migration, Retry-Vertrag |
| 3 | Belegvergleich korrigieren | Verhindert erfundene Zitate als Bewertungsgrundlage, R03 | 0,5–1 Tag | Keine größere Architekturabhängigkeit |
| 4 | Start- und Bind-Fehler vollständig behandeln | Verhindert unzugeordnete Calls und blockierende Sessions, R04/R06 | 1–2 Tage | Kontrollierter Abbruchpfad |
| 5 | Agentenrelease an unveränderlichen getesteten Stand binden | Schließt die Gate-Umgehung, R05 | 1–2 Tage | Release-Manifest und Konfigurationshash |
| 6 | Fortschrittsberechnung atomar und vollständig ausführen | Behebt R07/R08; korrekte Lernprofile auch bei Wachstum und Konkurrenz | 2–4 Tage | SQL-Aggregation/Transaktionskonzept |
| 7 | Gezielt Fehler- und Datenbankintegrationstests ergänzen | Sichert die Kernkorrekturen gegen Regressionen, R12 | 2–4 Tage | Isolierte Testdatenbank und kontrollierte Fehlerfälle |
| 8 | Löschung und Aufbewahrung über alle Datenkopien definieren | Behebt die technischen Zusage-/Implementierungsabweichungen, R09 | 2–4 Tage | Produktentscheidung zur Retention, Provider-Löschverfahren |
| 9 | Provider-Conversation serverseitig mit der Session korrelieren | Schließt die bedingte Zuordnungslücke, R10 | 1–3 Tage | Verfügbare Providermechanismen prüfen |
| 10 | Kriterienversion fest an Sessions binden | Sichert spätere Änderungen und historische Auswertungen, R11 | 1–2 Tage | Schema- und RLS-Anpassung |

R13 ist eine kleine, unabhängige Korrektur und kann zusätzlich kurzfristig erledigt werden.

## F. Abschließende Bewertung

### 1. Ist die Anwendung grundsätzlich professionell aufgebaut?

Ja, in ihrer Grundstruktur. Die Betriebsrobustheit erreicht diesen Anspruch noch nicht durchgängig.

### 2. Welche Komponenten sind besonders gut umgesetzt?

Die konservative Behandlung unklarer Rollenspielphasen, die ausgelagerte Bewertungslogik, Auth/RLS-Grundlagen, HMAC-Prüfung und die konkrete Dokumentation fachlicher Einschränkungen.

### 3. Wo liegen die größten technischen Risiken?

In unterbrochener Verarbeitung, ungesicherten Zustandsübergängen, umgehbaren Nutzungslimits und der Verlässlichkeit gespeicherter Bewertungen.

### 4. Welche Fehler sollten vor Produktiveinsatz behoben werden?

R01 bis R05. Zusätzlich sollten die tatsächliche Reichweite der Löschung und die Aufbewahrung wörtlicher Belege vor einer breiteren Nutzung geklärt sein.

### 5. Welche Architekturentscheidungen sollten überdacht werden?

Die synchrone, mehrstufige Webhook-Verarbeitung ohne sicheren Wiederanlauf; die nicht atomare Ersetzung abgeleiteter Daten; die clientseitig behauptete Conversation-Zuordnung; die fehlende feste Kriterienbindung.

### 6. Ist eine umfassende Überarbeitung erforderlich?

Nein. Gezielte Änderungen an Session-Lebenszyklus, Datenbankoperationen, Belegprüfung und Releaseverfahren reichen voraussichtlich aus.

## Abschlusskontrolle und Grenzen

**Tatsächlich untersucht:**

- Architektur und Dokumentation;
- Authentifizierung und Rollen;
- API-Routen;
- SQL-Migrationen und RLS;
- Voice-Start und Conversation-Bindung;
- Webhook-Verarbeitung;
- Coaching-Auswertung und Lernprofile;
- relevante Benutzer- und Adminoberflächen;
- Agentenkonfiguration;
- Release- und Recovery-Skripte;
- vorhandene Tests.

**Nicht geprüft:**

- Live-Systeme und tatsächlich deployte Konfigurationen;
- tatsächliche Produktionsdaten;
- aktuelle externe Schwachstellenmeldungen;
- vollständige historische Secret-Exposition;
- hörbare Voice-Qualität;
- gemessene Laufzeitperformance;
- aktuelle Ausführungsergebnisse von Tests oder Builds.

Alle vier Review-Perspektiven wurden abgedeckt. Während des Reviews wurden keine Projektdateien erstellt, verändert oder gelöscht, keine Tests oder Builds ausgeführt und keine externen Systeme aufgerufen. Die Ergebnisse beruhen ausschließlich auf statischer Analyse. Die nachträgliche Erstellung dieser Dokumentationsdatei ist davon getrennt und wurde ausdrücklich angefordert.

**Gesamturteil:** Solide Grundlage mit gezieltem Stabilisierungsbedarf. Vorrang haben die fünf P1-Findings; eine umfassende Neuentwicklung ist nach den vorliegenden Befunden nicht erforderlich.
