# Vorbereitung der Demo-Übernahme am 20.10.2026

## Auftrag und Grenzen

Der Nutzer hat der empfohlenen Übernahme der lokalen Korrekturen in die bestehende Demo zugestimmt. Dabei sollen der geprüfte Stand gesichert, mit dem aktuellen Hauptbranch zusammengeführt und Anwendung und Datenbank gemeinsam umgestellt werden.

Zusätzliche ausdrückliche Vorgabe: **Keine Änderung am ElevenLabs-Prompt.** Es wurde weder ein Prompt noch eine Agentenkonfiguration geändert oder veröffentlicht. Der Agentenrelease-Runner wurde nicht ausgeführt.

## Gesicherter und geprüfter Stand

- Korrekturen einschließlich bereits vorhandener Änderungen: Commit `e8f1c33`.
- Auf GitHub vorhandenes Next.js-Sicherheitsupdate: `7eb42fd`; konfliktfrei in den lokalen Stand integriert.
- Zusammengeführter, getesteter Anwendungscode: Commit `3d8add6`.
- Inhaltsnachweis des getesteten Git-Baums: `2bb3ab5058fedc7c6aaceae577cb854baf315888`.
- Bisheriger Demo-Stand: `7eb42fdae5378ed4005dacaf8d75e62b47b6f0e1`.
- Lokale Rücksprungmarke: `demo-before-review-2026-10-20`.
- Die ursprünglichen Reviews und Korrekturprotokolle wurden inhaltlich unverändert übernommen.

Die lokalen Nachweise liegen im ignorierten Verzeichnis `artifacts/demo-rollout-2026-10-20/`. Ein Git-Bundle und Patch sichern zusätzlich den vorherigen lokalen Stand.

## Tatsächlich durchgeführte Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| Installation anhand des integrierten Lockfiles (`npm ci`) | Bestanden |
| Vitest (`--maxWorkers=2`) | 320 Tests in 39 Dateien bestanden |
| Session-Lebenszyklus gegen isoliertes lokales PostgreSQL | 14 Verhaltenstests bestanden |
| Auswertungsverarbeitung gegen isoliertes lokales PostgreSQL | 18 Verhaltenstests bestanden |
| ESLint | Bestanden |
| TypeScript | Bestanden |
| Produktionsbuild | Bestanden, Next.js 16.4.2 |
| Playwright Desktop/Mobil | 6 Tests bestanden |
| Git-Whitespace-Prüfung | Bestanden nach Entfernung einer Leerraumzeile in einem Test |
| Abgleich versionierter Dateien mit vorhandenen lokalen Zugangsschlüsseln | 186 Dateien, 6 Zugangswerte, keine Treffer |

Der Schlüsselabgleich gibt keine Werte aus und ist kein vollständiger historischer Secret-Scanner. Die Untersuchung von Tracking, Ignore-Regeln und lokaler Git-Historie ist im Korrekturprotokoll für Paket A/B dokumentiert.

Die Playwright-Tests prüfen öffentliche Seiten, Login-/Passwort-Ansichten und Darstellung. Sie ersetzen keinen angemeldeten Sprachtest.

## Read-only Bestandsprüfung und Datensicherung

Die Vercel-Konfiguration verweist auf das Supabase-Projekt `lmwhuwlkcraddivcmjpw` (`ossi-sales-coach-v2`). Das Vercel-Projekt ist `prj_RRtra1pwXABLuHS8hS9aJlKHru7q`. Sein bisheriges fertiges Deployment `dpl_B3SZjLiJhNrLpRG9UWqX8FEoMpM4` stammt von Commit `7eb42fd`.

Zum Prüfzeitpunkt:

- 24 Sessions, alle `completed`; letzter Start am 17.10.2026.
- Keine offenen Sessions; die 16-Minuten-Voraussetzung war erfüllt. Unmittelbar vor einer späteren Migration erneut prüfen.
- Die beiden neuen Migrationen für Paket C und D sind remote noch nicht eingespielt.
- Alle elf vorhandenen öffentlichen Anwendungstabellen wurden lokal gesichert, darunter 24 Sessions und 144 Einzelbewertungen.
- Zusätzlich wurden 36 private Webhook-Receipts lokal gesichert.

Die Datensicherungen enthalten personenbezogene Anwendungsdaten und liegen ausschließlich im ignorierten lokalen Artefaktverzeichnis. Sie wurden nicht committed oder hochgeladen. Sie umfassen keine Auth-Zugangsdaten oder Storage-Objekte und sind kein vollständiger Datenbank-Dump. Da der Anwendungscode neue Datenbankfunktionen benötigt und alte Receipt-Funktionen entfernt werden, wäre nach einer Migration ein bloßer Code-Rollback auf den alten Stand unzureichend.

## ElevenLabs-Vertragsprüfung

Ein einzelner echter `get-signed-url`-Aufruf mit `include_conversation_id=true` für den bestehenden V2-Agenten und Branch lieferte HTTP 200. Die Antwort enthielt eine signierte WebSocket-URL mit der reservierten `conversation_id`; Host, Pfad und ID-Format entsprachen der neuen Validierung.

Die signierte URL und die Schlüssel wurden nicht ausgegeben oder in den Nachweis geschrieben. Es wurde keine WebSocket-Verbindung aufgebaut und kein Gespräch gestartet. Der Nachweis enthält nur Status, Feldnamen und Validierungsergebnis. Ein echter Audio-/Webhook-Durchlauf bleibt offen.

## Veröffentlichungsblocker

Der lokale Push-Trockenlauf wurde von GitHub mit HTTP 403 abgewiesen: Der verwendete Git-Zugang gehört zu `cw-collab` und besitzt kein Schreibrecht auf dieses Repository. Für `jessbot2701` waren lokal keine verwendbaren Git-Zugangsdaten vorhanden.

Die verbundene GitHub-App konnte das Repository unter dem Besitzerkonto lesen, lehnte das Anlegen eines Git-Baums aber ebenfalls mit HTTP 403 (`Resource not accessible by integration`) ab. Es wurde kein Remote-Branch aktualisiert.

Der Nutzer wurde gebeten, den lokalen GitHub-Zugang für `jessbot2701` herzustellen. Bis dahin bleiben Vercel und Supabase unverändert: keine Wartungspause, keine Migration, kein Deployment.

## Fortsetzung nach Herstellung des Zugangs

1. Remote-Stand erneut abrufen; inzwischen hinzugekommene Änderungen erhalten und gegebenenfalls erneut prüfen.
2. Schreibzugang mit Push-Trockenlauf bestätigen.
3. Demo kurz pausieren, offene Sessions und letzte Startzeit erneut kontrollieren sowie ausstehende alte Verarbeitung ausschließen.
4. Die geprüften Migrationen `20261020090942_protect_session_lifecycle.sql` und `20261020094802_reliable_evaluation_processing.sql` einspielen; Anwendung und Datenbank gemeinsam umstellen.
5. Den geprüften Git-Stand veröffentlichen, Vercel-Build und zugeordneten Commit kontrollieren, Demo wieder öffnen.
6. Erreichbarkeit, Auth-Schutz und Auswertungsmonitor prüfen.
7. Manuell ein kurzes vollständiges Training durchführen, Auswertung prüfen, unmittelbar ein zweites Training starten und einen Abbruch testen. Stimmenwechsel und Aussprache mit echtem Audio prüfen. Nur eigens angelegte Testdaten löschen.

Der ElevenLabs-Prompt und die Agentenkonfiguration bleiben bei sämtlichen Schritten unverändert.
