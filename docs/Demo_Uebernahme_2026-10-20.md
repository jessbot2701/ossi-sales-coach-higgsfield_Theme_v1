# Demo-Übernahme am 20.10.2026

**Ergebnis:** Die Korrekturen und das Sicherheitsupdate sind auf GitHub `main` und in der Demo veröffentlicht. Beide Datenbankmigrationen sind eingespielt. Die Projektpause ist aufgehoben, die Trainingsversion wieder aktiv und die temporäre Wartungsregel entfernt. Die technischen Prüfungen sind bestanden; der manuelle Sprach- und Auswertungstest mit einem echten angemeldeten Nutzer bleibt offen.

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
| Vercel-Produktionsbuild | Erfolgreich, Deployment `dpl_B6kGY7in1FbYx6XUXVSX6YUfrvUH` |
| Öffentliche Demo-Adresse und Login | Je HTTP 200 |
| Nicht angemeldeter Zugriff auf `/app` | HTTP 307 zur Login-Seite |
| Nicht angemeldeter Trainingsstart | HTTP 401 |
| Webhook ohne Signatur | HTTP 401 |
| Echter Auswertungsmonitor nach Freigabe | `healthy: true`, Exitcode 0 |

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

## Anfänglicher GitHub-Zugangsblocker – behoben

Der lokale Push-Trockenlauf wurde von GitHub mit HTTP 403 abgewiesen: Der verwendete Git-Zugang gehört zu `cw-collab` und besitzt kein Schreibrecht auf dieses Repository. Für `jessbot2701` waren lokal keine verwendbaren Git-Zugangsdaten vorhanden.

Die verbundene GitHub-App konnte das Repository unter dem Besitzerkonto lesen, lehnte das Anlegen eines Git-Baums aber ebenfalls mit HTTP 403 (`Resource not accessible by integration`) ab. Es wurde kein Remote-Branch aktualisiert.

Nach dem Hinweis des Nutzers auf seine VS-Code-Anmeldung zeigte eine erneute Prüfung beide gültigen CLI-Konten. `gh auth switch --hostname github.com --user jessbot2701` aktivierte das richtige Konto. Der Push wurde mit dem GitHub-CLI-Credential-Helper ausgeführt, damit nicht der andere Zugang aus dem Git Credential Manager verwendet wird. Der Push-Trockenlauf und anschließend der echte Push von `main` bis `6580ba0` waren erfolgreich. Ein vorübergehend nicht erreichbarer Sandbox-Proxy erforderte für den Push eine genehmigte Ausführung außerhalb der Sandbox.

## Durchgeführte Umstellung und gelöster Vercel-Blocker

- Vercel wurde pausiert; die öffentliche Adresse lieferte nachweislich `DEPLOYMENT_PAUSED`.
- Die Migration für Paket C prüfte die Vorbedingungen erfolgreich und wurde angewendet. Anschließend wurde Paket D angewendet.
- Die vom Migrationstool zunächst vergebenen Ausführungszeitstempel wurden in `supabase_migrations.schema_migrations` gezielt auf die beiden Versionen aus dem Repository abgeglichen.
- Nach der Migration waren weiterhin 24 Sessions und 144 Bewertungen vorhanden, ohne offene Sessions oder laufende Receipt-Verarbeitung.
- Der echte Auswertungsmonitor meldete `healthy: true`, keine überfälligen oder wiederholt fehlgeschlagenen Versuche und einen bereits vorher vorhandenen fehlgeschlagenen Receipt. Dieser historische Receipt wurde nicht verändert.
- Der GitHub-Deploy, ein expliziter API-Deploy und der CLI-Deploy aus einem isolierten Git-Archiv wurden während der Projektpause jeweils unmittelbar als `BLOCKED` angelegt. Diese Versuche wurden nicht als erfolgreiche Builds gezählt.
- Die aktive Trainingsversion `11000000-0000-0000-0000-000000000001` wurde vorsorglich vorübergehend deaktiviert und nach erfolgreichem Deployment wieder aktiviert.
- Die automatische Freigabeprüfung lehnte ein Aufheben der Projektpause ab, solange dadurch alter Code gegen die neue Datenbank erreichbar wäre.
- Eine vollständige Firewall-Wartungssperre wurde ebenfalls durch die automatische Freigabeprüfung abgelehnt. Die Connector-API meldete auch für engere Regeln `Seawall Config not found`. Das war keine belastbare Aussage über die aktuelle CLI-Unterstützung: Der Ablauf über die aktuelle CLI mit Entwurf und Veröffentlichung funktionierte anschließend.
- Der Nutzer erteilte ausdrücklich die zusätzliche Zustimmung: „Ja, temporäre Wartungsregel und Umstellung durchführen“.
- Mit der offiziellen Vercel-CLI 64.7.0 wurde ausschließlich die temporäre Regel `Temporary demo write maintenance 2026-10-20` hinzugefügt und veröffentlicht. Sie sperrte Pfade unter `/api/` sowie die Methoden POST, PUT, PATCH und DELETE.
- Nach Aufhebung der Projektpause wurden Trainingsstart, Webhook und POST auf `/login` tatsächlich mit HTTP 403 abgewiesen. Dadurch blieben die Schreibwege des alten Codes gesperrt.
- Der Produktionsbuild aus Commit `6580ba079b6ea30c1ef7484347c160516d16e13f` wurde danach erfolgreich gebaut. Deployment `dpl_B6kGY7in1FbYx6XUXVSX6YUfrvUH` erreichte `READY`; die kanonische Demo-Adresse wurde nachweislich diesem Deployment zugeordnet.
- Erst danach wurde die ursprüngliche Trainingsversion wieder aktiviert und ausschließlich die hinzugefügte Wartungsregel entfernt. Ihre Entfernung wurde veröffentlicht; anschließend bestanden alle fünf HTTP-Smokes und der Auswertungsmonitor.

Demo: <https://ossi-sales-coach-higgsfield-theme-v.vercel.app>

Der Datensicherungsstand wurde nicht zurückgespielt, da die Migrationen und Bestandsprüfungen erfolgreich waren. Alte blockierte Deployment-Versuche sind weiterhin als solche in Vercel sichtbar. Ein routinemäßiger Dokumentations-Push kann anschließend ein weiteres Deployment mit unverändertem Anwendungscode auslösen.

Der Prompt, die Agentenkonfiguration und bestehende Gesprächsinhalte blieben unverändert. Kein echtes Sprachgespräch wurde gestartet.

## Verbleibender manueller Test und Grenzen

1. Anmelden und ein kurzes vollständiges Training bis zum Gesprächsabschluss durchführen.
2. Die anschließende Auswertung auf sechs Kriterien, nachvollziehbare Belege und erhaltene Stärken prüfen.
3. Unmittelbar ein zweites Training starten und anschließend einen Abbruch testen.
4. Stimmenwechsel und Aussprache mit echtem Audio prüfen.
5. Nur eigens angelegte Testdaten löschen und die daraus aktualisierte Übersicht kontrollieren.

Es wurde kein echtes Sprachgespräch gestartet. Der Live-Nachweis umfasst den URL-Vertrag, Erreichbarkeit, Auth-/Signaturschutz und den Datenbankmonitor, nicht den vollständigen Audio-/Webhook-Zyklus. Für den Monitor wurde kein externer Zeitplan oder Alarmempfänger eingerichtet. Ein historisch fehlgeschlagener Receipt ist unverändert vorhanden; es gibt keine überfälligen oder wiederholt fehlgeschlagenen Verarbeitungsvorgänge.

Der ElevenLabs-Prompt und die Agentenkonfiguration bleiben bei sämtlichen Schritten unverändert.
