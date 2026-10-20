# Produktionsinbetriebnahme V2

Diese Schritte dürfen nur gegen neue, dedizierte V2-Projekte ausgeführt werden. Vor jedem ElevenLabs-Schreibvorgang müssen `elevenlabs/agents.json`, Agent-ID und CLI-Diff kontrolliert werden. Die V1-Agent-ID darf im Diff nicht vorkommen.

## 1. Supabase-Projekt

1. Neues Projekt in einer EU-Region erstellen.
2. Projekt lokal verknüpfen: `npx supabase link --project-ref <v2-ref>`.
3. Migration prüfen und anwenden: `npx supabase db push --dry-run`, danach `npx supabase db push`.
4. Unter Authentication → Configuration → General `Allow new users to sign up` deaktivieren. Der E-Mail-Provider bleibt aktiv, damit bestehende Nutzer sich anmelden und Administratoren neue Nutzer einladen können.
5. Unter Authentication → URL Configuration die V2-Produktions-URL und lokale Callback-URLs zulassen.
6. Unter Authentication → SMTP einen eigenen Produktions-SMTP-Dienst konfigurieren. Der Supabase-Testversand ist nicht für den Produktivbetrieb vorgesehen.
7. Das Invite-Template durch `supabase/email-templates/invite.html` ersetzen. Entsprechend kann das Recovery-Template auf `/auth/confirm` zeigen.
8. Einen ersten Nutzer einladen und anschließend einmalig per SQL zum Admin machen:

```sql
update public.app_roles
set role = 'admin', granted_at = now()
where user_id = (select id from auth.users where email = 'admin@example.com');
```

Die Migration aktiviert `pg_cron` und plant täglich `private.purge_expired_transcripts()`. Im Supabase Cron-Dashboard kontrollieren, dass `purge-expired-ossi-v2-transcripts` aktiv ist.

## 2. ElevenLabs-Agent

### Voraussetzung für die Verarbeitung ab Paket D

Die Migration `20261020094802_reliable_evaluation_processing.sql` benötigt Paket C. Anwendung, Webhook, Löschroute und Recovery-Werkzeug gemeinsam umstellen und laufende alte Worker vorher beenden bzw. ablaufen lassen. Die alten Receipt-RPCs ohne Versuchstoken werden entfernt. Alte unvollständige Receipts erhalten beim nächsten passenden Eingang einen neuen Claim; abgeschlossene Receipts bleiben abgeschlossen. Ein gemischter Betrieb alter und neuer Writer ist nicht unterstützt.

Receipt-Leases laufen zwei Minuten. Eine noch aktive Lease liefert HTTP 503 und darf nicht als erledigtes Duplikat quittiert werden. Erneute Zustellung übernimmt abgelaufene Versuche automatisch. Ohne weitere Providerzustellung sind Monitoring und die explizite Recovery anhand einer gespeicherten Vorschau erforderlich. Auswertung, alle Lernprofilbereiche, Fortschritt und Receipt-Abschluss werden atomar geschrieben; auch die Sessionlöschung berechnet Aggregate in derselben Transaktion neu.

Nach einer späteren, separat freigegebenen Inbetriebnahme den read-only Check `npm run maintenance:evaluations:health` mindestens minütlich ausführen und Exitcode 1 oder 2 an das vorhandene Monitoring melden. Standardwerte: `EVALUATION_FAILURE_ATTEMPTS=3`, `EVALUATION_MAX_OVERDUE=0`, `EVALUATION_MAX_REPEATED_FAILURES=0`. Exitcode 0 bedeutet innerhalb der Schwellen, 2 überschrittene Schwellen, 1 fehlende bzw. fehlerhafte Prüfung. Dieser lokale Durchlauf richtet keinen externen Scheduler oder Alarmempfänger ein.

Bestehende Aggregate können gezielt mit `select public.rebuild_learning_profiles('<user-uuid>');` repariert werden, auch wenn die ursprüngliche Session gelöscht wurde. Die Funktion verwendet ausschließlich vorhandene abgeschlossene Bewertungen; fehlende Providerbewertungen werden dadurch nicht rekonstruiert. Vor einem Bestandslauf betroffene Nutzer auswählen und vorhandene Ergebnisse sichern. Alte Cleanup-/Einmalskripte sind nicht Teil des neuen transaktionalen Schreibpfads und dürfen nicht parallel als Online-Writer betrieben werden.

Vorschau-/Recovery-Anleitung, Datenschutzgrenzen der lokalen Plan-Dateien und lokale Testnachweise: [Korrekturprotokoll Paket D](Korrekturprotokoll_2026-10-20_Paket_D.md).

### Voraussetzung für den Session-Lebenszyklus ab Paket C

Die Migration `20261020090942_protect_session_lifecycle.sql` und der zugehörige Anwendungscode müssen bei einer später separat freigegebenen Inbetriebnahme gemeinsam eingeführt werden. Währenddessen neue Starts sperren, bestehende Gespräche kontrolliert beenden und mindestens 16 Minuten seit dem letzten alten Start abwarten. Es dürfen keine Sessions mit Status `created` oder `active` mehr vorhanden sein. Die Migration verweigert andernfalls die Ausführung. Ein bloßes Umsetzen des Datenbankstatus beendet keine Provider-Verbindung. Alte Conversations erhalten durch die Migration keine nachträglich als vertrauenswürdig deklarierte Zuordnung; ihre späten Webhooks werden ignoriert. Ausstehende alte Auswertungen daher vor der Umstellung abschließen.

Der Start fordert `include_conversation_id=true` an und speichert die vom Provider reservierte Conversation-ID vor Ausgabe der einmal verwendbaren signierten URL. Fehlende oder widersprüchliche IDs werden abgewiesen. Vor einer Produktivfreigabe ist dieser Vertrag mit dem eingesetzten Providerkonto kontrolliert zu prüfen. In diesem lokalen Durchlauf wurde kein Provider aufgerufen.

Ein Abbruch beendet zunächst das Browser-SDK. Die Datenbank gibt den Platz erst nach bestätigtem Providerende frei; Providerfehler halten die Sperre aufrecht. Ein ungenutzter, nicht gebundener Zugang kann nach 16 Minuten bei Provider-404 freigegeben werden. Bei gebundenen Gesprächen reicht Zeitablauf nicht. Ein erneuter Start prüft einen offenen Providerstatus erneut. Details, lokale Testanleitung und Grenzen: [Korrekturprotokoll Paket C](Korrekturprotokoll_2026-10-20_Paket_C.md).

Ziel laut Repository:

- Agent: `agent_1901kxtjy2q5e77bp29wnkc2jnqv`
- Branch: `agtbrch_4401kxtjy2qme72rdn3qkn5a61dg`
- Konfiguration: `elevenlabs/agent_configs/Coaching-Kaltakquise-V2.0.json`

Die acht synthetischen Simulationen unter `elevenlabs/test_configs/` werden nach Änderungen zunächst mit folgendem Befehl über die ElevenLabs Test API synchronisiert. Dadurch werden ihre IDs in `elevenlabs/tests.json` registriert und lokal am V2-Agenten angehängt:

```bash
npm run test:agent:sync
```

Vor jedem Release muss `ELEVENLABS_API_KEY` ausschließlich als Umgebungsvariable gesetzt sein. Der freigegebene Ablauf ist `npm run release:agent`; ein direkter CLI-Push umgeht das verpflichtende Gate und ist kein gültiger V2-Release.

Der Release-Runner führt in dieser Reihenfolge aus:

1. `agents.json` enthält exakt die freigegebene Agent-ID und Branch-ID.
2. Alle acht Tests sind registriert und in `platform_settings.testing.attached_tests` angehängt.
3. Agent, Testdefinitionen, Zuordnungen und Gate-Regeln werden als SHA-256-adressierter Snapshot gespeichert. Die Remote-Testdefinitionen müssen vor dem Start damit übereinstimmen. Die Kandidatenkonfiguration dieses Snapshots läuft per `agent_config_override`; jeder Test wird fünfmal ausgeführt.
4. Standardtests benötigen mindestens 4/5, Geheimhaltung sowie Manipulations- und Rollenfestigkeit 5/5.
5. Der Runner prüft Invocation, Branch, Wiederholungszahl, eindeutige Runs sowie die tatsächlich je Run verwendete Definition (`test_info`). Fehlende oder abweichende Nachweise blockieren. Erst danach pusht die CLI ausschließlich Agent `agent_1901kxtjy2q5e77bp29wnkc2jnqv` auf Branch `agtbrch_4401kxtjy2qme72rdn3qkn5a61dg`, aus einer isolierten Kopie des Snapshots.
6. Alle im Snapshot konfigurierten Felder werden remote verglichen. Überraschungsmodus und gezielte Einwandbehandlung laufen anschließend mit den Testzuordnungen des Snapshots ohne Override als Post-Push-Smokes. Danach wird die Remote-Konfiguration erneut geprüft.

### Snapshot, Wiederaufnahme und Nachweis

Die Belege liegen lokal im bereits ignorierten Verzeichnis `artifacts/test-results/release-snapshots/`:

- `<sha256>.json`: Agentenkonfiguration, Registry-Eintrag, acht Testdefinitionen mit IDs und Gate-Policy. Die Datei wird exklusiv angelegt; ihr Inhalt wird beim Resume erneut gehasht.
- `<invocation>.json`: exklusiv gespeicherte Zuordnung des vollständigen Gates zum Snapshot, unmittelbar nach dem Start und vor dem Polling.
- `<invocation>-result.json`: Snapshot-Hash, Invocation, tatsächliche Runs und Gate-Ergebnis.
- `<invocation>-published.json`: Snapshot-Hash, Gate-Invocation, Veröffentlichungsstatus, Remote-Konfigurationshash und Smoke-Invocation. Ein Fehler nach Pushbeginn bleibt als fehlgeschlagener beziehungsweise bei Prozessabbruch unvollständiger Versuch sichtbar.

Ein unterbrochenes vollständiges Gate kann so wiederaufgenommen werden:

```bash
node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/elevenlabs-agent-release.mjs release-from-invocation <suite_id>
```

Resume verwendet ausschließlich den zugeordneten Snapshot, auch wenn Arbeitsdateien inzwischen geändert wurden. Es fragt das Gate-Ergebnis erneut ab und startet kein neues vollständiges Gate. Fehlende oder beschädigte Belege, eine andere Gate-Policy sowie fremde Invocations werden abgewiesen. Ältere Invocations ohne Snapshot, fokussierte Gates und Smokes berechtigen nicht zur Veröffentlichung. Geht die Startantwort verloren oder bricht der Prozess vor dem Speichern der Zuordnung ab, ist kein automatischer Resume möglich; es wird niemals nachträglich eine beliebige Invocation einem aktuellen Kandidaten zugeordnet.

Beim Konfigurationsvergleich ist nur die Reihenfolge von JSON-Objektschlüsseln unerheblich. Entsprechend der installierten ElevenLabs-CLI wird das veraltete `conversation_config.agent.prompt.tools` auf beiden Seiten entfernt, wenn `tool_ids` vorhanden ist; auch das Gate-Override verwendet diese Darstellung. Array-Reihenfolge, Nullwerte und alle übrigen konfigurierten Inhalte müssen exakt stimmen. Zusätzliche Top-Level-Metadaten der GET-Antwort werden nicht als Konfiguration behandelt. Unbekannte Provider-Normalisierungen oder fehlendes `test_info` führen zum Abbruch und benötigen eine gezielte Vertragsprüfung, keine pauschale Lockerung.

Grundlagen: [Run tests](https://elevenlabs.io/docs/eleven-agents/api-reference/tests/run-tests), [Get test](https://elevenlabs.io/docs/eleven-agents/api-reference/tests/get), [Get test invocation](https://elevenlabs.io/docs/eleven-agents/api-reference/tests/test-invocations/get). Die lokale Regression führt den echten Runner in temporären Verzeichnissen mit synthetischer Umgebung, vollständig ersetztem `fetch` und abgefangenem CLI-Prozess aus. Sie ruft keine Provider auf.

Die Snapshot-Dateien sind ein lokaler Integritätsnachweis, keine Signatur gegen einen Angreifer mit Schreibzugriff auf alle Belege. Den gesamten Belegordner aufbewahren. Unabhängige Remote-Releases müssen betrieblich serialisiert werden; der Runner kann spätere externe Änderungen am Branch nicht sperren. Ein fehlgeschlagener Post-Push-Check rollt den bereits erfolgten Push nicht automatisch zurück.

Der Runner protokolliert nur Testname, Passrate und eine kurze ElevenLabs-Fehlergruppe, niemals API-Key oder vollständige Transkripte.

Zusätzliche Kontrollen vor dem Release:

1. Agent-Registry lesen und sicherstellen, dass sie genau einen V2-Agenten enthält.
2. Remote-Agent read-only abrufen und Agent-/Branch-ID vergleichen.
3. CLI-Diff prüfen: keine V1-ID, `record_voice=false`, `retention_days=30`, `delete_transcript_and_pii=false`, `zero_retention_mode=false`, `send_audio=false`, Auth aktiviert.
4. Nur über `npm run release:agent` die freigegebene V2-Konfiguration pushen.
5. Post-Call-Webhook für `post_call_transcription` auf `https://<v2-domain>/api/webhooks/elevenlabs` konfigurieren, HMAC aktivieren und keinen Audio-Webhook abonnieren.
6. Webhook-Secret nur als `ELEVENLABS_WEBHOOK_SECRET` in Vercel speichern.
7. Während der Probephase bleiben Transkripte und Analysen 30 Tage als Wiederherstellungs-Fallback bei ElevenLabs gespeichert; Audioaufzeichnung und Audio-Webhooks bleiben deaktiviert. Nach der Probephase die Aufbewahrung erneut bewerten und gegebenenfalls wieder Zero Retention aktivieren.

## 3. Vercel-Projekt

Ein neues Vercel-Projekt direkt mit diesem Repository verknüpfen. Keine bestehende V1-Projekt-ID übernehmen. Folgende Variablen ausschließlich im V2-Projekt setzen:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `SUPABASE_SECRET_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_WEBHOOK_SECRET`
- `ELEVENLABS_ALLOWED_AGENT_IDS=agent_1901kxtjy2q5e77bp29wnkc2jnqv`
- `TRANSCRIPT_CONSENT_VERSION`

Nach dem Deployment Supabase Site URL/Redirect-Allowlist und den ElevenLabs-Webhook auf die finale V2-Domain aktualisieren.

## 4. Abnahme

- direkter Signup-Versuch wird abgelehnt; Admin-Einladung bleibt möglich
- Einladung → Passwort setzen → Login
- aktive Einwilligung → Voice-Session → Bindung
- signierter Test-Webhook → genau sechs Bewertungen und Lernziel
- doppelter identischer Webhook → HTTP 200 mit `duplicate=true`
- Nutzer A kann Session von Nutzer B nicht lesen
- gesperrte Nutzer und Administratoren können auch mit einem bestehenden JWT keine Profildaten, Sessions oder Lernstände mehr lesen
- Sperren setzt zusätzlich einen Supabase-Auth-Ban; Reaktivieren hebt ihn wieder auf
- manipulierte Auth-Links mit externem `next`-Ziel bleiben auf der eigenen Anwendung
- ein Nutzer kann höchstens eine vorbereitete oder aktive Voice-Session gleichzeitig halten; ab dem elften Start innerhalb einer Stunde antwortet die API mit HTTP 429
- normaler Nutzer kann Rollen/Trainingsdaten nicht schreiben
- Admin sieht Sessions, kann Transkript/Scores aber nicht editieren
- Session-Löschung entfernt Bewertungen; Nutzerlöschung entfernt alle personenbezogenen V2-Daten
- Desktop- und Mobile-Visualtests bleiben grün
- Manueller Audio-Smoke nach dem Release: Coach-Modus mit Helmut starten, eine weibliche Rolle mit Susanne und eine männliche Rolle mit Christian prüfen, anschließend den hörbaren Wechsel zurück zu Helmut bestätigen. Zusätzlich Aussprache von „IGZ“, „SAP EWM“, „Logistik“ und einem typischen deutschen Terminvorschlag kontrollieren. Textsimulationen ersetzen diesen akustischen Test nicht.
