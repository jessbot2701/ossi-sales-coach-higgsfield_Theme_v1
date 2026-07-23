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
3. Die lokale Kandidatenkonfiguration läuft per `agent_config_override`; jeder Test wird fünfmal ausgeführt.
4. Standardtests benötigen mindestens 4/5, Geheimhaltung sowie Manipulations- und Rollenfestigkeit 5/5.
5. Erst danach pusht die CLI ausschließlich Agent `agent_1901kxtjy2q5e77bp29wnkc2jnqv` auf Branch `agtbrch_4401kxtjy2qme72rdn3qkn5a61dg`.
6. Überraschungsmodus und gezielte Einwandbehandlung laufen anschließend ohne Override als Post-Push-Smokes gegen die gespeicherte Remote-Version.

Der Runner protokolliert nur Testname, Passrate und eine kurze ElevenLabs-Fehlergruppe, niemals API-Key oder vollständige Transkripte.

Zusätzliche Kontrollen vor dem Release:

1. Agent-Registry lesen und sicherstellen, dass sie genau einen V2-Agenten enthält.
2. Remote-Agent read-only abrufen und Agent-/Branch-ID vergleichen.
3. CLI-Diff prüfen: keine V1-ID, `record_voice=false`, `delete_audio=true`, `send_audio=false`, Auth aktiviert.
4. Nur über `npm run release:agent` die freigegebene V2-Konfiguration pushen.
5. Post-Call-Webhook für `post_call_transcription` auf `https://<v2-domain>/api/webhooks/elevenlabs` konfigurieren, HMAC aktivieren und keinen Audio-Webhook abonnieren.
6. Webhook-Secret nur als `ELEVENLABS_WEBHOOK_SECRET` in Vercel speichern.
7. Wenn Zero Retention im Tarif nicht verfügbar ist, `zero_retention_mode` vor dem Push auf `false` setzen, `delete_audio=true` beibehalten und die minimale zulässige Provider-Aufbewahrung wählen.

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
