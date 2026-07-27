# Testfall-Katalog – Ossi Voice Coach V2

Stand: 26. Juli 2026
Testumgebung: lokale Next.js-App unter `http://127.0.0.1:3000`, Supabase-Projekt `ossi-sales-coach-v2`, ElevenLabs-Agent V2.

## Gesamtergebnis

| Prüfebene | Ergebnis |
| --- | --- |
| Unit-, Integritäts- und Konfigurationstests | 105/105 bestanden |
| TypeScript | bestanden |
| ESLint | bestanden |
| Next.js-Produktionsbuild | bestanden, 15 Seiten erzeugt |
| Desktop-/Mobile-Visualtests | 6/6 bestanden |
| Lokaler Produktions-Performance-Smoke | 6/6 bestanden |
| Browser-/API-/RLS-Funktionstests | 36/36 bestanden |
| Finales ElevenLabs-Release-Gate | 38/40 Simulationen, Gate bestanden |
| Post-Push-Smoke gegen Live-V2 | 2/2 bestanden |
| Reale Audio-/Webhook-E2E-Gespräche | 3/3 bestanden |
| Transkript-Retention und Cronjob | bestanden |
| Temporäre Testdaten | vollständig entfernt |

## Performance-Pass vom 27. Juli 2026

- Geschützte Portalaufrufe führen im Proxy keinen zweiten Profil-Query mehr aus. Die Aktivprüfung bleibt in der gecachten serverseitigen Seitenautorisierung erhalten.
- Die Fortschritts-Neuberechnung lädt keine Transkripte mehr. Bewertungen, Sessions, Trainingsversionen, Kriterien und Kompetenzen werden über einen relationalen Query geladen.
- Kompetenzfortschritte und Lernprofile werden gebündelt statt kriteriumsweise geschrieben.
- Sieben fehlende Fremdschlüssel-Indizes wurden ergänzt. Ein zusätzlicher partieller Index deckt abgeschlossene Sessions pro Nutzer ab.
- Die RLS-Hilfsfunktionen werden über InitPlans einmal pro Statement statt potenziell pro Zeile ausgewertet.
- Supabase-Migration: `20260727070000_optimize_query_paths`.

Lokaler Produktionsbuild, jeweils nach 1,5 Sekunden Beobachtungszeit:

| Seite | TTFB | FCP | LCP | CLS | Load | Max. Long Task | Transfer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Landing Desktop | 165 ms | 432 ms | 432 ms | 0 | 419 ms | 64 ms | 3,18 MB |
| Landing Mobile | 16 ms | 132 ms | 132 ms | 0 | 168 ms | 0 ms | 0,99 MB |
| Login Desktop | 36 ms | 128 ms | 128 ms | 0 | 138 ms | 0 ms | 0,32 MB |
| Login Mobile | 14 ms | 84 ms | 84 ms | 0 | 110 ms | 0 ms | 0,32 MB |
| Dashboard Desktop | 241 ms | 328 ms | 328 ms | 0 | 300 ms | 0 ms | 0,01 MB |
| Dashboard Mobile | 129 ms | 188 ms | 188 ms | 0 | 154 ms | 0 ms | 0,01 MB |

Diese Laborwerte stammen von `http://127.0.0.1:3000`. Sie ersetzen keine Feldmessung der späteren Live-Domain.

## Browser-, API- und Datenbankfunktionen

Quelle: `artifacts/test-results/full-functional-20260727071438.json`

| ID | Testfall | Ergebnis |
| --- | --- | --- |
| UI-01 | Öffentliche Landingpage lädt vollständig | PASS |
| UI-02 | Mobile Layout hat keinen horizontalen Überlauf | PASS |
| AUTH-01 | Geschützte Seite leitet anonym zum Login um | PASS |
| AUTH-02 | Ungültige Anmeldung zeigt neutrale Fehlermeldung | PASS |
| AUTH-03 | Passwort-Reset-Modus ist erreichbar und reversibel | PASS |
| AUTH-04 | Passwortformular validiert Mindestlänge und Gleichheit | PASS |
| AUTH-05 | Login ignoriert ein externes `next`-Ziel | PASS |
| NAV-01 | Dashboard zeigt Nutzer, Kennzahlen und Sessionverlauf | PASS |
| NAV-02 | Hilfeseite und Navigation sind erreichbar | PASS |
| TRAIN-01 | Überraschungsmodus ist Standard; fehlende Einwilligung sperrt Start | PASS |
| TRAIN-02 | Gezieltes Training bietet alle sechs Schwerpunkte | PASS |
| RLS-01 | Normaler Nutzer wird aus dem Adminbereich zurückgeleitet | PASS |
| SESSION-01 | Sessiondetail zeigt Bewertungen, Zeit und Phasentrenner | PASS |
| RLS-02 | Fremde Session ist für normalen Nutzer nicht lesbar | PASS |
| RLS-03 | Fremde Session kann nicht gelöscht werden | PASS |
| DELETE-01 | Abgebrochene Löschbestätigung erhält die Session | PASS |
| DELETE-02 | Bestätigtes Löschen entfernt Session und Bewertungen | PASS |
| DELETE-03 | Session-Löschen berechnet Kompetenzfortschritt und Lernprofil neu | PASS |
| API-START-01 | Sessionstart verlangt Einwilligung | PASS |
| API-START-02 | Veraltete Einwilligungsversion wird abgelehnt | PASS |
| API-START-03 | Fokusmodus verlangt einen Schwerpunkt | PASS |
| API-START-04 | Gültiger Start liefert signierte URL und Personalisierung | PASS |
| API-START-05 | Paralleler zweiter Start wird blockiert | PASS |
| API-BIND-01 | Bindung validiert die Conversation-ID | PASS |
| API-BIND-02 | Session wird genau einmal mit der Conversation verknüpft | PASS |
| API-BIND-03 | Identische Bindung ist idempotent | PASS |
| API-BIND-04 | Abweichende zweite Bindung wird blockiert | PASS |
| API-START-06 | Stündliches Limit wird vor dem Provider-Aufruf erzwungen | PASS |
| ADMIN-01 | Admin sieht Nutzer- und Sessionverwaltung | PASS |
| ADMIN-02 | Admin öffnet fremde Sessions schreibgeschützt | PASS |
| ADMIN-03 | Einladungsroute validiert Eingaben | PASS |
| ADMIN-04 | Admin kann sich nicht selbst sperren oder löschen | PASS |
| ADMIN-05 | Sperren blockiert eine bestehende Nutzersession | PASS |
| ADMIN-06 | Reaktivieren hebt Profil- und Auth-Sperre auf | PASS |
| ADMIN-07 | Nutzerlöschung entfernt personenbezogene Daten per Kaskade | PASS |
| AUTH-06 | Abmelden beendet die Portalsitzung | PASS |

## Agenten-Simulationen und Live-Release

Finale Gate-Invocation: `suite_4701kyfbmsmne4baym9kk4xkme6n`
Gate-Bericht: `artifacts/test-results/elevenlabs-gate-2026-07-26T140408827Z.json`

| Simulation | Ergebnis |
| --- | --- |
| Überraschung bleibt geheim | 5/5 |
| Skeptischer Entscheider | 4/5 |
| Zentrale unter Zeitdruck | 5/5 |
| Gezielte Einwandbehandlung | 4/5 |
| Freie Fokuswahl | 5/5 |
| Personalisierung ohne Erfindungen | 5/5 |
| Kompaktes Debriefing und exakte Phasenmarker | 5/5 |
| Manipulations- und Rollenfestigkeit | 5/5 |

Alle kritischen Szenarien erreichten 5/5. Die übrigen Szenarien erfüllten die definierte Freigabeschwelle von mindestens 4/5. Danach wurde ausschließlich V2 auf den vorgesehenen ElevenLabs-Branch gepusht. Die beiden Post-Push-Smokes bestanden gegen die gespeicherte Remote-Konfiguration.

## Reale Coaching- und Rollenspiel-E2E-Tests

Quelle: `artifacts/test-results/multi-voice-e2e-1785075626758.json`

Der Treiber wartet anhand der ElevenLabs-PCM-/Alignment-Ereignisse die vollständige Sprachausgabe ab. Dadurch prüft der Webhook das tatsächlich ausgesprochene und nicht vorzeitig unterbrochene Transkript.

| ID | Gespräch | Provider | Webhook-/Bewertungsergebnis |
| --- | --- | --- | --- |
| VOICE-01 | Überraschungsmodus, vollständiger Beratungsverlauf | `done`, 17 Turns | 6 Bewertungen, 6 Scores, 6 Rollenspielbelege, PASS |
| VOICE-02 | Einwandbehandlung: schwach beginnen, dann klären | `done`, 17 Turns | 6 Bewertungen, 6 Scores, 6 Rollenspielbelege, PASS |
| VOICE-03 | Abschluss und konkrete Terminsteuerung | `done`, 17 Turns | 6 Bewertungen, 6 Scores, 6 Rollenspielbelege, PASS |

Jeder Fall umfasste Coach-Intro, „Ich bin bereit“, exakten Startmarker, Kundenrolle, sechs Nutzerturns innerhalb der erkannten Rollenspielphase, explizites Rollenende, exakten Endmarker, Coach-Debrief und Verabschiedung. Die Prüfung bestätigte:

- Coach-Aussagen wurden nicht als Bewertungsbeleg verwendet.
- Alle Belege stammen aus Nutzerturns der erkannten Rollenspielphase.
- Alle sechs Kriterien wurden gespeichert.
- Die Session wurde anschließend über die App gelöscht.
- Session- und Bewertungszeilen waren nach dem Löschen nicht mehr vorhanden.

## Retention, Cleanup und Datenintegrität

- Der Cronjob `select private.purge_expired_transcripts();` ist täglich um 02:17 Uhr aktiv.
- Ein eigener abgelaufener Testdatensatz verlor nur Transkript und erhielt `transcript_deleted_at`.
- Status, Titel und Zusammenfassung blieben erhalten.
- Der Retention-Testdatensatz wurde anschließend gelöscht.
- Das temporäre Admin-Testkonto wurde gelöscht.
- Auth-User, Profil, Rolle, Sessions, Fortschrittszeilen und Lernprofile des Testkontos wurden jeweils mit Anzahl 0 verifiziert.
- Zwölf Webhook-Receipts aus den Voice-Testläufen wurden gezielt entfernt.
- Der Datenbestand entspricht danach wieder dem Ausgangsbestand: 3 Nutzer, 6 Sessions, 36 Bewertungen, 2 Fortschrittszeilen, 2 Lernprofile und 6 verknüpfte Webhook-Receipts; keine verwaisten Receipts.

## Gefundene und korrigierte Fehler

1. Das Löschen einer Session ließ Kompetenzfortschritt und Lernprofil veraltet. Nach dem Löschen werden beide nun aus den verbleibenden gültigen Sessions neu berechnet.
2. Admins konnten fremde Sessions auflisten, aber deren Detailseite nicht öffnen. Admins erhalten nun einen schreibgeschützten Detailzugriff.
3. Inaktive Nutzer konnten in eine Login-/Portal-Weiterleitungsschleife geraten. Die Middleware prüft nun den aktiven Profilstatus.
4. V2 bestätigte die Bereitschaft teilweise vor dem Startmarker. Die Zustandsregel erzwingt den Marker als ersten Inhalt der Übergangsantwort.
5. Die Zentrale leitete bei bloßen Schlagworten teilweise zu früh weiter. Nun sind Fachgebiet plus konkreter Nutzen oder Anlass erforderlich.
6. V2 konnte einen vereinbarten nächsten Schritt fälschlich als Rollenende interpretieren. Der Coach-Wechsel ist nun nochmals ausdrücklich an die Nutzerformulierung „Rollenspiel beendet“ gebunden.
7. Der erste Voice-E2E-Treiber unterbrach die TTS-Ausgabe zu früh. Er wartet nun auf die tatsächliche PCM-/Alignment-Dauer.

## Noch manuell zu prüfen

Diese Punkte sind nicht automatisiert als PASS zu werten:

- Subjektive Hörprüfung von Stimme, Aussprache, Lautstärke und Rollenstimmen Helmut/Susanne/Christian auf echten Lautsprechern.
- Erfolgreiche Zustellung einer Einladungs-E-Mail an ein kontrolliertes Postfach.
- Erfolgreiche Zustellung einer Passwort-Reset-E-Mail an ein kontrolliertes Postfach.

Die Formular-, Sicherheits- und Fehlerpfade der beiden E-Mail-Funktionen wurden getestet. Eine echte Zustellung wurde nicht ausgelöst, weil kein ausdrücklich freigegebenes Testpostfach vorlag.

## Supabase-Advisors

- Sicherheit: `private.webhook_receipts` hat bewusst keine Client-RLS-Policy (INFO); Leaked-Password-Protection ist deaktiviert (WARN).
- Performance: Sieben Fremdschlüssel haben keinen eigenen abdeckenden Index (INFO).
- Es wurden keine ungefragten Datenbank- oder Auth-Konfigurationsänderungen vorgenommen.

## Wiederholbare Befehle

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npm run test:functional
npm run test:agent:debrief
npm run test:agent:reception
npm run release:agent
npm run test:voice:e2e -- <kontrollierte-test-email>
```
