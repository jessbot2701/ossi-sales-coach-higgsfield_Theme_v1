# Korrekturprotokoll – Paket C – 20.10.2026

## Umfang und Ausgangsstand

Grundlage: `Review_2026-10-20_Kombiniert.md`, Paket C: K02, K05, K07, K11, K16 und die lebenszyklusbezogenen Teile von K19. K13 begleitet diese Änderungen durch gezielte Verhaltenstests. Die vollständige Testinfrastruktur und CI-Einrichtung bleiben außerhalb dieses Durchlaufs.

Der Arbeitsstand enthielt bereits umfangreiche nicht committete Änderungen einschließlich Paket A/B. Ausgangs-HEAD: `defa3e32dcacf043bbf3e78c1d5976234344498f`. Status und SHA-256-Dateihashes wurden vor Änderungen unter `artifacts/package-c-2026-10-20/baseline.json` festgehalten. Bestehende Änderungen wurden erhalten; die Webhook-Route und ihr Verhaltenstest wurden darauf aufbauend ergänzt. Die ursprünglichen Reviews und `Korrekturprotokoll_2026-10-20.md` bleiben unverändert.

Gelesen wurden die geltenden AGENTS.md-Anweisungen, der kombinierte Review und die einschlägigen Projektvorgaben. Supabase-Migrationen, vorhandener Start-/Bind-/Lösch-/Webhook-Ablauf und installierter ElevenLabs-React-SDK wurden geprüft. Es erfolgten keine produktiven Datenänderungen, Deployments, echten Agentenreleases, kostenpflichtigen Provideraufrufe, Commits oder Pushes.

## Gemeinsame Lösung

Die Migration `20261020090942_protect_session_lifecycle.sql` führt `private.voice_session_attempts` ein. Dieser minimale Nutzungsnachweis enthält keine Transkripte oder Auswertungen und hat bewusst keinen Fremdschlüssel auf löschbare Sessioninhalte. Nutzungszählung und Reservierung werden unter einem benutzerbezogenen PostgreSQL-Transaktionslock atomar ausgeführt. Ein zusätzlicher eindeutiger Index erlaubt höchstens einen offenen Versuch pro Nutzer. Die Funktionen laufen intern mit festem leerem Suchpfad; öffentliche Invoker-Wrapper sind ausschließlich für `service_role` ausführbar.

Der Server reserviert zuerst lokal, fordert dann eine einmal verwendbare signierte Provider-URL mit Conversation-ID an und speichert diese ID vor Rückgabe an den Browser. Bindung und Webhook akzeptieren ausschließlich diese serverseitige Zuordnung. Ein Abbruch markiert den Versuch als abgebrochen, hält einen ausgegebenen Providerzugang aber gesperrt, bis sein Abschluss verifiziert ist. Die Sperre überlebt das Löschen der Trainingsinhalte.

Unveröffentlichte Vorbereitungen dürfen nach zwei Minuten verfallen; späte Providerantworten können sie danach nicht mehr aktivieren. Ausgegebene Zugänge werden durch einen passenden signierten Abschluss-Webhook oder einen geprüften Providerstatus `done`/`failed` geschlossen. Provider-404 erlaubt nur bei einem nicht gebundenen, seit über 16 Minuten ausgegebenen Zugang die Freigabe. Eine gebundene Verbindung wird niemals allein aufgrund ihres Alters freigegeben. Provider- und Datenbankfehler halten die Sperre aufrecht.

## Befunde und Abnahmen

### K02 – Unabhängige Zählung und Parallelitätsgrenzen

**Bestätigt.** Der bisherige Start zählte `coaching_sessions`; deren Löschung entfernte die Zählgrundlage und die Grundlage des bisherigen Index für offene Sessions. Dies wurde gegen das ursprüngliche Schema tatsächlich reproduziert: Session anlegen, löschen, Stundenanzahl null.

**Änderung:** Separater Nutzungsnachweis, atomare Reservierung, maximal zehn Versuche pro Stunde und ein offener Versuch. Auch fehlgeschlagene reservierte Starts zählen. Löschen ist über die API nur für `completed`/`failed` möglich; das tatsächliche Löschresultat wird geprüft. Ausgegebene, noch nicht sicher beendete Providerzugänge bleiben unabhängig vom Inhaltsstatus gesperrt.

**Geprüft:** Zwölf konkurrierende Starts reservieren genau einmal. Zwölf Konkurrenten um den letzten Stundenplatz überschreiten zehn nicht. Zehn reservierte, kompensierte und gelöschte Sessions führen weiterhin zur Limitantwort. Abbruch und Inhaltslöschung geben einen ausgegebenen Zugang nicht frei. Später Bind wird abgewiesen; ein verifizierter später Webhook schließt den Nutzungsnachweis ohne Wiederherstellung gelöschter Inhalte. API-Verhalten wird direkt ohne UI ausgeführt.

**Grenzen:** Keine serverseitige Fernbeendigung einer Providerverbindung behauptet. Das Browser-SDK erhält den Beendigungsauftrag; die Sperre bleibt bis zur Bestätigung bestehen. Geschlossene Nachweise älter als 24 Stunden werden bei einer späteren Reservierung dieses Nutzers bereinigt. Dies ist keine garantierte tägliche Löschfrist; die umfassende Retentionregel gehört zu K10.

### K05 – Fehler im Bind-Callback

**Bestätigt.** Das installierte React-SDK wartet den asynchronen `onConnect`-Callback nicht ab. Ein späterer `fetch`-Fehler erreicht den äußeren Formular-Catch nicht.

**Änderung:** `voice-session-client.ts` übernimmt Callback-Fehler lokal, höchstens drei identische Bindversuche mit begrenzten Wartezeiten und je vier Sekunden Request-Timeout. Endgültige Fehler beenden das SDK und rufen den autorisierten Abbruchpfad auf. Statusmeldungen unterscheiden bestätigte Freigabe und noch ausstehenden Abschluss. Verspätete Antworten aktivieren keinen abgebrochenen Browserzustand.

**Geprüft:** Verlorene erfolgreiche Bindantwort wird mit derselben ID wiederholt; drei Fehlschläge führen zu SDK-Ende und Abbruch; fachlicher Konflikt wird nicht erneut versucht. SDK-/Abbruchfehler bleiben behandelt. Späte Bindantworten, späte Connect-Callbacks, reguläres Gesprächsende und Unmount sind getestet.

**Grenzen:** Tests führen die tatsächlich verwendete Callback-Steuerung mit einem ersetzten SDK aus. Mikrofon, Netzwerkabbruch im realen Browser und reale Audiowiedergabe wurden nicht geprüft. Bei Browserabsturz kann kein Client-Abbruch garantiert werden; die Serversperre bleibt erhalten.

### K07 – Startfehler, Timeout und Kompensation

**Bestätigt.** Der bisherige Ablauf konnte nach Sessionanlage bei Netzwerk-/JSON-/SDK-Fehlern eine offene Vorbereitung zurücklassen.

**Änderung:** Providerrequests erhalten zehn Sekunden Timeout und Antwortvalidierung. Alle Fehler nach Reservierung führen zur sessionbezogenen Kompensation, die ausschließlich einen noch nicht ausgegebenen Versuch schließt. Bereits ausgegebene/aktive Zustände werden durch diesen Fehlerpfad nicht überschrieben. Der neue authentifizierte Abbruch-Endpunkt ist auch für inzwischen gesperrte Eigentümer verfügbar. Der Client besitzt einen 30-Sekunden-Verbindungswächter und räumt beim Unmount auf.

**Geprüft:** HTTP-, Netzwerk-, Timeout-, JSON-, Schema- und Korrelationsfehler; fehlgeschlagene Speicherung und Kompensation; synchroner SDK-Fehler, `onError`, Disconnect und Timeout; konkurrierender Bind/Abbruch; späte Ausgabe nach Ablauf der Vorbereitung. Ein alter Kompensationsaufruf ändert eine aktive Session nicht.

**Grenzen:** Eine verlorene Startantwort nach erfolgreicher Grant-Speicherung lässt die ID dem Browser unbekannt. Der Server erkennt den offenen Versuch beim nächsten Start und prüft dessen Providerstatus. Ein ungenutzter Zugang kann bis zur sicheren Ablaufprüfung blockieren. Bei Providerausfall bleibt ein erneuter Start gesperrt.

### K11 – Vertrauenswürdige Conversation-Zuordnung

**Bedingter Befund bestätigt.** Der alte Bindpfad übernahm eine vom Client behauptete Conversation-ID, ohne ihre Herkunft aus dem autorisierten Start nachzuweisen. Ein Beschaffungsweg für fremde IDs wurde nicht nachgewiesen und wird hier nicht behauptet.

**Providermechanismus vor Umsetzung bestätigt:** Die [ElevenLabs-Dokumentation für signierte URLs](https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-signed-url) beschreibt `include_conversation_id=true` und die damit einmal verwendbare Signatur. Die [Authentifizierungsdokumentation](https://elevenlabs.io/docs/eleven-agents/customization/authentication) beschreibt 15 Minuten URL-Gültigkeit; bestehende Verbindungen können länger bestehen. Die [Conversation-API](https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get) liefert Conversation-, Agent-ID und Status zur Abschlussprüfung.

**Änderung:** Provider-ID vor URL-Ausgabe speichern, WSS-URL und IDs prüfen, widersprüchliche/fehlende IDs ablehnen. Kein Fallback auf eine vom Browser behauptete ID. Webhooks nutzen denselben Nachweis und prüfen die Agent-ID. Fehlgeschlagene Korrelationsprüfung darf keine Session verändern.

**Geprüft:** Eigene ID bindbar; bekannte fremde ID, fremder Eigentümer und Wiederverwendung einer bereits vergebenen ID abgewiesen. Früher und wiederholter Webhook bleiben bei derselben Zuordnung. Falscher Agent verändert den Nachweis nicht. Abgebrochene/gelöschte Inhalte werden nicht wiederhergestellt.

**Grenzen:** Kein Live-Providervertragstest in diesem Durchlauf. Der Parser akzeptiert die ID im URL-Query oder als explizites Antwortfeld, lehnt widersprüchliche Angaben ab und verweigert ohne nachweisbare ID den Start. Vor Produktivfreigabe ist die tatsächliche Antwortform des eingesetzten Kontos kontrolliert zu bestätigen. Alte Conversations werden nicht rückwirkend als verifiziert importiert.

### K16 – Tatsächlicher Bind-Erfolg

**Bestätigt.** Der alte bedingte Write prüfte den Fehler, aber nicht die betroffenen Zeilen. Ein konkurrierender Request konnte dadurch Erfolg melden, obwohl er keine Änderung geschrieben hatte.

**Änderung:** Transaktionaler Bind prüft Eigentümer, reservierte ID, Abbruchzustand und tatsächliches Update mittels `ROW_COUNT`. Identische Bindung ist idempotent; aktive, bereits verarbeitete oder abgeschlossene identische Zuordnungen bleiben bestätigt. Andere IDs erhalten Konflikt, DB-Fehler HTTP 503.

**Geprüft:** Parallele korrekte/fremde IDs, identische gleichzeitige Bindungen mit genau einem Erstübergang, Wiederholung nach verlorener Antwort, Bind gegen gelöschte/abgebrochene Session und technische RPC-Fehler.

**Grenzen:** Eine frühe bestätigte Abschlussmeldung kann vor dem Browser-Bind eintreffen; dann bestätigt Bind die bestehende verifizierte Zuordnung, ohne den Status wieder auf aktiv zu setzen.

### K19 – Entscheidungsrelevante Fehler im Lebenszyklus

**Bestätigt.** Start-/Bind-/Webhook-Abfragen konnten technische Fehler als fehlende fachliche Daten behandeln.

**Änderung:** Konfigurations- und Kontextabfragen beim Start, Reservierungs-/Kontroll-RPCs, Session-Lesen/Löschen und Webhook-Korrelation werden explizit geprüft. Webhook-Kriterienfehler werden von einer tatsächlich leeren Kriterienmenge getrennt. Keine Providerantwortkörper oder signierten URLs werden geloggt. Die bestehende Webhook-Korrelation über Request-/Conversation-ID bleibt erhalten.

**Geprüft:** Fehler in sechs Start-Lesequellen führen zu 503 ohne Providerstart. Bind-RPC-Fehler werden nicht als Erfolg ausgegeben. Technischer Session-/Korrelationsfehler im Webhook führt zu 503 und einem fehlgeschlagenen Receipt ohne Bewertungsschreiben. Löschen prüft Lesefehler und konkurrierenden Zustandswechsel.

**Grenzen:** K19 ist damit nur im Paket-C-Umfang bearbeitet. Allgemeine Fehlerverträge, flächendeckende Request-Korrelation sowie übrige Admin-/API-Pfade bleiben Paket E. Receipt-Abschluss-/Retry-Garantien und atomare Auswertung/Lernprofile bleiben K03/K08 in Paket D.

## Tests und Reproduzierbarkeit (K13, gezielt)

Neue Verhaltenstests: `tests/session-lifecycle.test.ts`, `tests/voice-session-client.test.ts`, `tests/db/session-lifecycle.mjs`. `tests/roleplay-webhook.test.ts` wurde erweitert. Überholte reine Quelltextprüfungen in `session-start-security.test.ts` und `training-ui.test.ts` wurden entfernt beziehungsweise angepasst; sie dienen nicht als Nachweis der neuen Parallelitätsgarantien.

Der DB-Test erzeugt einen eigenen nativen PostgreSQL-17.10-Cluster auf `127.0.0.1` und einem freien Port. Er akzeptiert keine externe Datenbank-URL. Alle vorhandenen Migrationen und die neue Migration werden eingespielt. `auth.users`, `auth.uid()`, die relevanten Rollen sowie Storage-Minimalstruktur sind Test-Fixtures; `pg_cron` wird durch einen Scheduler-Stub ersetzt. Die Funktionen, Transaktionen, Sperren, Constraints und RLS werden von echtem PostgreSQL ausgeführt. Der Cluster wird im `finally` beendet; lokale Artefakte bleiben unter dem ignorierten Artefaktverzeichnis.

Einmalige lokale Vorbereitung unter Windows, ohne Projektabhängigkeiten zu ändern:

```powershell
npm install --prefix artifacts/package-c-2026-10-20/db-tools --ignore-scripts --no-audit --no-fund @embedded-postgres/windows-x64@17.10.0-beta.17 pg@8.23.1
```

Prüfungen aus dem Projektverzeichnis:

```powershell
npm run test:db:sessions
npm test -- --maxWorkers=2
npm run typecheck
npm run lint
npm run build
git diff --check
```

Die begrenzte Workerzahl vermeidet unnötige Konkurrenz auf diesem Windows-Rechner. Ein vorheriger Lauf mit gleichzeitigen Qualitäts-/DB-Prüfungen hatte einen 5-Sekunden-Timeout im bestehenden Release-Runner-Test; es war kein Provideraufruf. Der unveränderte Test besteht im abschließenden Lauf. Der DB-Test zeigt den ursprünglichen Lösch-/Zählfehler vor Einspielen der Korrektur und anschließend die korrigierten Garantien. Für die übrigen Fehler wurde kein vollständiger Vorher-Lauf der neuen Tests gegen alten Anwendungscode aufgezeichnet.

Tatsächliche Endergebnisse:

| Prüfung | Ergebnis | Lokaler Beleg unter `artifacts/package-c-2026-10-20/` |
|---|---|---|
| Gesamte Vitest-Suite, zwei Worker | 297/297 Tests, 38/38 Dateien bestanden | `tests-final.txt` |
| Isolierter PostgreSQL-Lauf | 14/14 Verhaltenstests bestanden; Cluster anschließend beendet | `postgres-tests.txt` |
| TypeScript | bestanden | `typecheck.txt` |
| ESLint | bestanden | `lint.txt` |
| Next.js-Produktionsbuild | bestanden | `build.txt` |
| Git-Whitespaceprüfung | bestanden | `git diff --check` |
| Erhalt des Ausgangsstands | HEAD unverändert; alle vorbestehenden Datei-Hashes unverändert außer den gezielt erweiterten drei Dateien | `baseline.json` |

Die drei gezielt erweiterten vorbestehenden Änderungen sind `app/api/webhooks/elevenlabs/route.ts`, `tests/roleplay-webhook.test.ts` und `docs/production-setup.md`. Reviews, vorheriges Korrekturprotokoll und sämtliche anderen vorbestehenden Änderungen stimmen bytegenau mit dem gesicherten Ausgangsstand überein.

Die DB-Prüfung ersetzt keinen vollständigen Supabase-Stack: Auth-/PostgREST-Transport und echte Providerverbindungen sind nicht enthalten. Keine CI oder umfassende Testinfrastruktur eingerichtet.

## Geänderte Dateien dieses Durchlaufs

- API: `app/api/sessions/start/route.ts`, `app/api/sessions/[id]/bind/route.ts`, `app/api/sessions/[id]/abort/route.ts` (neu), `app/api/sessions/[id]/route.ts`, `app/api/webhooks/elevenlabs/route.ts`.
- Steuerung: `lib/coaching/session-lifecycle.ts` und `lib/coaching/voice-session-client.ts` (beide neu), `components/training-launcher.tsx`.
- Datenbank: `supabase/migrations/20261020090942_protect_session_lifecycle.sql` (neu).
- Tests: `tests/session-lifecycle.test.ts`, `tests/voice-session-client.test.ts`, `tests/db/session-lifecycle.mjs` (neu), `tests/roleplay-webhook.test.ts`, `tests/session-start-security.test.ts`, `tests/training-ui.test.ts`.
- Ausführung und Dokumentation: `package.json` mit `test:db:sessions`, `docs/production-setup.md`, dieses neue Protokoll.

## Inbetriebnahme und offene Arbeit

Die neue Migration wurde ausschließlich in isolierten lokalen Testclustern angewandt. Eine spätere Inbetriebnahme muss neue Starts während der Umstellung sperren, alte Gespräche tatsächlich beenden, ausstehende alte Auswertungen abschließen und mindestens 16 Minuten seit dem letzten alten Start warten. Bei noch `created`/`active` oder zu jungen Sessions bricht die Migration ab. Anwendung und Migration sind gemeinsam einzuführen; ein Rolling Deployment mit altem Startcode ist nicht vorgesehen.

Als Nächstes folgt Paket D: K03, K08, K09 und K21 mit Receipt-Leases, atomaren Auswertungs-/Aggregatwrites, abgesicherter Recovery und Monitoring. Der hier ergänzte Lebenszyklus-Nachweis ist dabei zu erhalten. K10 muss die endgültige Aufbewahrungs- und Löschregel der minimalen Nutzungsnachweise definieren.
