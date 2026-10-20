# Korrekturprotokoll – Paket D – 20.10.2026

## Auftrag und Ausgangsstand

Paket D aus `Review_2026-10-20_Kombiniert.md`: K03, K08, K09 und K21. Gezielte Verhaltenstests begleiten die Korrekturen im Sinne von K13. Die bestehenden Änderungen aus früheren Durchläufen einschließlich Paket C wurden als Ausgangsstand übernommen. HEAD und SHA-256-Hashes aller zuvor geänderten/unversionierten Dateien stehen unter `artifacts/package-d-2026-10-20/baseline.json`.

Geltende AGENTS.md-Anweisungen, Review, vorhandene Migrationen, Betriebsdokumentation, Webhook-/Lösch-/Aggregations-/Recovery-Pfade und vorhandene Tests wurden gelesen. Die Skills `senior-engineering-execution` und `supabase` wurden angewandt. Relevante technische Grundlagen wurden anhand des [Supabase-Changelogs](https://supabase.com/changelog), der [Datenbankfunktions-Dokumentation](https://supabase.com/docs/guides/database/functions) und der [PostgreSQL-Sperrdokumentation](https://www.postgresql.org/docs/17/explicit-locking.html) geprüft.

Keine produktiven Datenänderungen, Deployments, echten Agentenreleases, kostenpflichtigen Provideraufrufe, Commits oder Pushes. Die neue Migration wurde nur in isolierten lokalen Testdatenbanken ausgeführt. Ursprüngliche Reviews und frühere Korrekturprotokolle bleiben unverändert.

## K03 – Receipt-Leases, Abschluss und Wiederaufnahme

**Befund bestätigt.** `claim_webhook_receipt` behandelte `processing` ohne Ablaufzeit als erledigtes Duplikat. Die Webhook-Route prüfte den Abschluss-RPC nicht durchgängig. Gegen das alte Schema wurde tatsächlich reproduziert, dass ein seit einem Tag unvollständiger Claim erneut `duplicate` liefert.

**Änderung:** Die neue Migration ersetzt die alten Receipt-RPCs durch `claim_evaluation`, `complete_evaluation` und `fail_evaluation`. Ein Claim erhält ein UUID-Versuchstoken und eine Zwei-Minuten-Lease. Gleichzeitige Zustellungen sehen `busy`; die Route liefert 503 statt Erfolg. Nach Lease-Ablauf darf genau ein neuer Worker übernehmen. Jeder Ergebnis-/Fehlerabschluss prüft das aktuelle Token; alte Worker können weder Ergebnisse noch einen gültigen Receipt-Status überschreiben.

Bewertungen, Session, sämtliche betroffenen Aggregate, Verbindungsabschluss und Receipt-Abschluss sind Teil einer einzigen SQL-Transaktion. Ein HTTP-Erfolg wird erst nach deren bestätigtem Abschluss gesendet. Geht die erfolgreiche Commit-Antwort verloren, erkennt die nächste Zustellung den dauerhaft abgeschlossenen Receipt als Duplikat. Eine fehlgeschlagene oder unbestätigte Fehlerquittierung wird strukturiert protokolliert; die Lease bleibt als Wiederaufnahmemechanismus erhalten.

Payload-Identität wird aus den tatsächlich ausgewerteten Providerfeldern kanonisch gebildet. GET- und Webhook-Transportmetadaten verändern diese Identität nicht; geänderte Bewertungsinhalte führen zu Konflikten. Unvollständige Legacy-Receipts ohne Token dürfen einmal von ihrem alten Rohtext-Hash auf diesen Hash wechseln. Alte abgeschlossene Receipts bleiben terminal und werden nicht neu ausgewertet.

**Abnahmen:** Alter Dauer-Duplikatfehler reproduziert; zwölf konkurrierende Claims mit genau einem Gewinner; simulierter Workerabbruch und Reclaim; alter Erfolgs- und Fehlerabschluss abgewiesen; identische Wiederholung sicher; abweichender Inhalt abgewiesen; Fehler beim Receipt-Abschluss rollen auch fachliche Änderungen zurück; verlorene erfolgreiche Commit-Antwort wiederholbar; HTTP 503 für `busy`/ungeklärten Commit.

**Monitoring:** `evaluation_health` meldet nur Zähler und Alter, keine Transkripte oder Nutzerdetails. `maintenance:evaluations:health` prüft standardmäßig jeden überfälligen Claim und jeden aktuell fehlgeschlagenen Receipt mit mindestens drei Fehlern als Alarm. Schwellen sind über `EVALUATION_FAILURE_ATTEMPTS`, `EVALUATION_MAX_OVERDUE` und `EVALUATION_MAX_REPEATED_FAILURES` konfigurierbar. Exitcodes: 0 innerhalb der Schwellen, 2 Alarm, 1 Prüfung nicht möglich. Alte verifizierte Zuordnungen bleiben bei ausstehenden Auswertungen von der opportunistischen Paket-C-Bereinigung ausgenommen.

**Grenzen:** Es wird kein zusätzlicher Payload-Queue-Speicher eingeführt. Nach erneutem Eingang erfolgt der Reclaim automatisch. Bleiben weitere Providerzustellungen aus, muss der überwachte Fehler über die explizite Recovery aufgeholt werden. Ein externer Minutentakt und Alarmempfänger werden lokal nicht eingerichtet. Provider-Retry-Verhalten wurde nicht live getestet.

## K08 – Atomare Ergebnisse und vollständige Lernprofile

**Befund bestätigt.** Die alten Writes für Bewertungen, Session, Fortschritt und Lernprofil waren unabhängig. Löschen und Neuberechnung waren ebenfalls getrennt. Eine Berechnung konnte auf einem veralteten Zwischenstand basieren; nach erfolgreicher Löschung war eine erneute Löschung kein Reparaturmechanismus.

**Änderung:** `complete_evaluation`, `delete_session_consistently` und `rebuild_learning_profiles` serialisieren pro Nutzer mit demselben PostgreSQL-Transaktionslock wie Paket C. Die Aggregation wird innerhalb der schreibenden Transaktion ausgeführt. Alle Trainingsartbereiche und das globale Profil werden aus dem dann aktuellen Bestand neu aufgebaut; entfallene Bereiche verschwinden. Der eigenständige Rebuild benötigt nur die Nutzer-ID, keine noch vorhandene Quell-Session.

Abgeschlossene Inhalte werden von Recovery und späteren Webhooks nicht überschrieben. Bei einer bereits abgeschlossenen Session mit unvollständigem Legacy-Receipt werden die abgeleiteten Aggregate vor dem Receipt-Abschluss neu aufgebaut. Normale bereits abgeschlossene Receipt-Duplikate lösen keine erneuten fachlichen Writes aus.

**Abnahmen:** Fehler per PostgreSQL-Trigger an sechs Schreibstationen injiziert: Bewertungen, Session, Fortschritt, Lernprofile, Verbindungsnachweis und Receipt. In jedem Fall bleibt der gesamte vorherige Zustand bestehen; Wiederholung ohne den injizierten Fehler besteht. Parallel eintreffende Webhooks erhalten beide Beiträge. Gleichzeitiger Webhook und Löschen verlieren keine Änderungen; das Löschen derselben Session stellt keine Inhalte wieder her. Ein Fehler bei der Lösch-Neuberechnung rollt auch die Löschung zurück. Letzte Bewertung gelöscht und eigenständiger Rebuild ohne Quell-Session entfernen die Aggregate vollständig.

**Grenzen:** Die Garantie gilt für die neuen Webhook-, Lösch-, Recovery- und Rebuild-Pfade. Die älteren expliziten Cleanup-/Einmalskripte schreiben weiterhin direkt; sie dürfen nicht parallel als Online-Writer ausgeführt werden und gehören zur späteren Wartungsbereinigung K20. Eine Bestandssanierung aller produktiven Nutzer wurde nicht ausgeführt. Der Rebuild rekonstruiert keine fehlenden Providerbewertungen.

## K09 – Gesamte Bewertungshistorie

**Befund bestätigt.** Der bisherige unpaginierte Abruf über die Data API konnte an `max_rows = 1000` abgeschnitten werden. Das produktive Limit wurde nicht abgefragt.

**Änderung:** `private.competency_aggregates` aggregiert vollständig in PostgreSQL. Die Reihenfolge ist eindeutig über `completed_at DESC`, Session-ID und Kriterium-ID. Gezählt werden wie bisher gültige Kriterienbewertungen pro Kompetenz. Mittelwert wird auf zwei Dezimalstellen gerundet; jüngster Score und Trend basieren auf derselben Reihenfolge. Trend bleibt der Vergleich der letzten drei mit den davorliegenden drei Bewertungen, Schwelle 0,35 und mindestens sechs Werte.

Stärken bleiben mindestens drei Bewertungen mit Durchschnitt mindestens 4. Fokusbereiche werden nach jüngstem Score, Durchschnitt und bei Gleichstand Kompetenz-ID bestimmt. Globale Lernempfehlungen bleiben abgeleitete Empfehlungen. Trainingsartprofile verwenden das gelieferte Lernziel der jüngsten noch vorhandenen, gültig bewerteten Session oder den bisherigen fachlichen Fallback. Beim Löschen entfällt auch das Lernziel der gelöschten Quelle.

**Abnahmen:** 999, exakt 1.000 und 1.002 Bewertungen mit gleichen Zeitstempeln liefern vollständige Anzahl, korrekten Durchschnitt, eindeutigen jüngsten Score und erwarteten Trend. Die Anwendung transportiert keine unvollständige Bewertungsmenge mehr zum Rebuild; ein SQL-Fehler rollt den gesamten Rebuild zurück.

**Grenzen:** Kein Lastbenchmark mit Produktionsdaten. Die SQL-Aggregation bevorzugt vollständige, nachvollziehbare Neuberechnung gegenüber inkrementellen Caches; bei sehr großen Historien ist die Laufzeit vor einer späteren Skalierung zu messen.

## K21 – Vorschaugebundene Recovery

**Befund bestätigt.** Das alte Skript akzeptierte ausgewählte Conversation-IDs, konnte aber auch abgeschlossene Sessions ohne Prüfung des Vorschauzustands überschreiben. Fachliche Extraktion/Validierung war mit der Webhook-Route dupliziert.

**Änderung:** `prepare-evaluation.ts` enthält die gemeinsame Extraktion, Phasenerkennung, Belegvalidierung, Sprachprüfung und Sessionerzeugung. Die fachlichen Regeln aus Paket A/B bleiben erhalten. `--preview` erstellt für genau eine explizite Conversation einen gespeicherten Plan einschließlich erwarteter Sessionrevision, Ergebnis und Prüfsumme. Voraussetzung sind Providerstatus `done`, passende Provider-/Agent-ID und die verifizierte Zuordnung aus Paket C.

`--apply` akzeptiert ausschließlich den gespeicherten Plan und ruft den Provider nicht erneut auf. Die SQL-Funktion prüft Revision und Status unter dem Nutzerlock und verarbeitet mit demselben transaktionalen Abschluss wie der Webhook. Session- und Bewertungsänderungen erhöhen die Revision. Bereits abgeschlossene Sessions bleiben geschützt; es gibt keinen pauschalen Überschreibschalter. Eine Wiederholung desselben erfolgreich angewandten Plans wird als Duplikat bestätigt.

**Abnahmen:** Vorschau führt keine Writes/Claims aus. Identitäts-/Statusfehler werden abgewiesen. Eine nach Vorschau veränderte Session wird in PostgreSQL nicht überschrieben. Bearbeiteter Plan scheitert vor dem DB-Aufruf. Nicht ausgewählte Sessions werden nicht angewandt. Abgeschlossene Sessions bleiben geschützt. Wiederholung ist sicher. Der echte Webhook-Handler liefert dieselben fachlichen Ergebnisse wie die Recovery-Vorschau für dieselben freigegebenen Daten.

**Grenzen:** Plan-Prüfsumme ist ein Schutz gegen versehentliche Bearbeitung, keine Signatur gegen jemanden mit Schreibzugriff auf Plan und Prüfsumme. Pläne enthalten Bewertungen und Transkripte; sie müssen unter dem ignorierten `artifacts/` bleiben, geschützt gespeichert und nach Abschluss entfernt werden. Alte Sessions ohne verifizierten Paket-C-Nachweis werden nicht automatisch legitimiert. Eine fachliche Neubewertung bereits abgeschlossener historischer Sessions benötigt einen separaten Auftrag.

## Bedienung nach gesonderter Freigabe

Vorschau, Plan prüfen, dann denselben Plan anwenden:

```powershell
node --experimental-strip-types --env-file-if-exists=.env.local scripts/recover-elevenlabs-sessions.mts --preview artifacts/recovery/plan.json conv_EXPLIZITE_ID
node --experimental-strip-types --env-file-if-exists=.env.local scripts/recover-elevenlabs-sessions.mts --apply artifacts/recovery/plan.json
npm run maintenance:evaluations:health
```

Die Vorschau liest die ausgewählte Conversation beim Provider; Apply verwendet ausschließlich den Plan. Die genannten Produktionsbefehle wurden in diesem Durchlauf nicht ausgeführt.

Unabhängige Reparatur bestehender Aggregate, nach expliziter Nutzerauswahl und Sicherung des Ausgangsstands:

```sql
select public.rebuild_learning_profiles('<user-uuid>');
```

Migration und neue Writer zusammen einführen, alte Worker zuvor drainen. Die Migration entfernt die alten Receipt-Funktionen ohne Token. Ein paralleler Betrieb alter und neuer Writer ist nicht unterstützt. Paket C einschließlich seiner Rollout-Voraussetzungen muss zuvor vorhanden sein. Historische terminale Receipts werden nicht pauschal zurückgesetzt.

## Lokale Prüfungen und K13

Die Datenbanktests starten eigene native PostgreSQL-17.10-Cluster auf `127.0.0.1` mit freien Ports. Keine externe DB-URL wird akzeptiert. Alle Migrationen werden ausgeführt. Auth-/Storage-Minimalobjekte und Rollen sind Fixtures; `pg_cron` wird durch einen Scheduler-Stub ersetzt. SQL-Transaktionen, Constraints, Sperren und Rollenrechte laufen in echtem PostgreSQL. Die Cluster werden nach jedem Lauf beendet. Die vorhandenen lokalen DB-Testwerkzeuge aus Paket C werden wiederverwendet.

```powershell
npm run test:db:evaluations
npm run test:db:sessions
npm test -- --maxWorkers=2
npm run typecheck
npm run lint
npm run build
git diff --check
```

Belege liegen unter `artifacts/package-d-2026-10-20/`. Der ursprüngliche K03-Fehler ist vor der neuen Migration im DB-Test reproduziert. Für K08/K09/K21 wurden der Ausgangscode bestätigt und die korrigierten Garantien mit Verhaltenstests nachgewiesen; ein vollständiger roter Vorher-Lauf aller neuen Anwendungstests wurde nicht aufgezeichnet.

Tatsächliche Abschlussresultate:

| Prüfung | Ergebnis | Beleg |
|---|---|---|
| Vollständige Vitest-Suite | 320/320 Tests in 39/39 Dateien bestanden | `tests-final.txt` |
| Paket-D-PostgreSQL-Verhaltenstests | 18/18 bestanden | `postgres-tests.txt` |
| Paket-C-PostgreSQL-Regression mit neuer Migration | 14/14 bestanden | `postgres-sessions.txt` |
| TypeScript | bestanden | `typecheck.txt` |
| ESLint | bestanden | `lint.txt` |
| Next.js-Produktionsbuild | bestanden | `build.txt` |
| Native Node-Imports der Recovery-/Monitoring-Module | bestanden, ohne Provider-/DB-Aufruf | lokale Konsole |
| `git diff --check` | bestanden; nur Git-Hinweise auf spätere LF/CRLF-Konvertierung | lokale Konsole |
| Arbeitsstandserhalt | HEAD unverändert; Reviews und frühere Protokolle hashidentisch | `baseline.json` |

Im ersten vollständigen Anwendungstestlauf scheiterte eine alte Textprüfung, die den inzwischen ersetzten unpaginierten Aggregationscode erwartete. Sie wurde auf den neuen Aufrufpfad angepasst; der eigentliche Nachweis erfolgt über die PostgreSQL-Verhaltenstests. Während der Implementierung wurden außerdem Syntaxfehler im neuen Test-/Migrationscode korrigiert. Die oben aufgeführten Abschlussläufe verwenden die korrigierten Dateien.

Die zuvor bereits geänderten Dateien wurden nur an den vorgesehenen Integrationsstellen erweitert: Webhook, Löschroute, Recovery-Skript, Paket-C-/Webhook-Tests, Paket-C-DB-Runner, `package.json` und die beiden betroffenen Betriebs-/Rollenspieldokumente. Alle übrigen im Ausgangssnapshot enthaltenen Dateien sind bytegenau erhalten.

Die vollständige Supabase-Auth-/PostgREST-Umgebung, echte Providerzustellungen und eine externe Alarmkette sind nicht Bestandteil dieser lokalen Tests. Keine vollständige CI-/Testinfrastruktur eingerichtet.

## Dateien und nächste Schritte

- Neue Migration: `supabase/migrations/20261020094802_reliable_evaluation_processing.sql`.
- Verarbeitung: `app/api/webhooks/elevenlabs/route.ts`, `app/api/sessions/[id]/route.ts`, `lib/coaching/recompute.ts`; neu `lib/coaching/prepare-evaluation.ts`, `lib/coaching/evaluation-recovery.ts`, `lib/coaching/processing-health.ts`.
- Werkzeuge: `scripts/recover-elevenlabs-sessions.mts`; neu `scripts/check-evaluation-health.mts`; Ausführungsbefehle in `package.json`.
- Tests: neu `tests/evaluation-recovery.test.ts`, `tests/db/evaluation-processing.mjs`; erweitert `tests/roleplay-webhook.test.ts`, `tests/session-lifecycle.test.ts`, `tests/server-security-boundaries.test.ts`, `tests/db/session-lifecycle.mjs`.
- Dokumentation: `docs/production-setup.md`, `docs/multiple-roleplays.md`, dieses neue Protokoll.

Als Nächstes folgt Paket E: K17, K18, übrige Teile von K19 und K25. Retention der minimalen technischen Nachweise, Kriterienversionierung und alte Wartungsskripte bleiben Paket F. Vor jeder produktiven Nutzung von Paket C/D bleiben Migration, kontrollierter Providervertragstest, Bestandsbehandlung und externe Monitoring-Einrichtung separat freizugeben.
