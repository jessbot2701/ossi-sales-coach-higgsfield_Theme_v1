# Ossi – AI Sales Coach V2

Isolierte, personalisierte Voice-Coaching-Plattform auf Basis von Next.js, Supabase und ElevenLabs. Dieses Repository ist ausschließlich für V2 bestimmt. Es enthält genau den Agenten `Coaching Kaltakquise V2.0` (`agent_1901kxtjy2q5e77bp29wnkc2jnqv`) und ist nicht mit dem produktiven V1-Repository oder dessen Deployment verbunden.

## Enthalten

- visuell unveränderte öffentliche Ossi-Landingpage
- Einladung-only Auth mit Passwort-Reset
- persönliche Dashboards, Trainingsauswahl und Session-Auswertung
- wählbares Überraschungsszenario, das Ossi erst im Gespräch offenbart
- „Ossi überrascht dich“ als Standard; alle Gespräche sind anspruchsvoll und adaptiv
- persönliches Kurzresümee für bekannte Nutzer vor dem Trainingsstart
- Lernfokus als Empfehlung: Überraschungsmodus oder freie Auswahl aller aktiven Schwerpunkte
- Adminbereiche für Nutzer und Sessions
- Supabase-Schema, RLS, Seeds, Kaskaden und tägliche 12-Monats-Bereinigung
- signierter ElevenLabs-Sessionstart ohne API-Key im Browser
- HMAC-validierter, idempotenter Post-Call-Webhook
- sechs nullable 1–5-Bewertungen und fortlaufende Lernprofile
- versionierte V2-Agentenkonfiguration mit deaktivierter Audiospeicherung

## Lokal starten

```bash
cp .env.example .env.local
npm install
npm run dev
```

Benötigte Variablen stehen in `.env.example`. Ohne eigenes V2-Supabase-Projekt sind Landingpage, Build und Unit-/Visualtests nutzbar; geschützte Bereiche benötigen die Supabase-Variablen.

## Verifikation

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Die acht versionierten ElevenLabs-Multi-Turn-Simulationen werden bewusst nicht bei jedem normalen CI-Lauf ausgeführt. Testdefinitionen werden einmalig beziehungsweise nach Änderungen mit `npm run test:agent:sync` in den dedizierten V2-Workspace synchronisiert. Vor einem Agenten-Release führt `npm run test:agent:release` das Kandidaten-Gate mit lokalem Konfigurations-Override aus. Der einzige freigegebene vollständige Release-Pfad ist:

```bash
npm run release:agent
```

Dieser Befehl validiert zuerst Agent- und Branch-ID, führt jeden Test fünfmal aus, pusht nur nach bestandenem Gate den V2-Agenten und startet danach zwei Smokes gegen die gespeicherte Remote-Konfiguration. Der Schlüssel wird ausschließlich aus `ELEVENLABS_API_KEY` gelesen; vollständige Simulationstranskripte werden nicht ausgegeben. Details und den verpflichtenden manuellen Audio-Smoke beschreibt [docs/production-setup.md](docs/production-setup.md).

Die vollständige Produktionsinbetriebnahme einschließlich SMTP, Auth-Templates, erstem Admin, Cron, Webhook und Vercel-Secrets ist in [docs/production-setup.md](docs/production-setup.md) beschrieben.

## Datenschutz

Vor jeder Session ist eine aktive, versionierte Einwilligung erforderlich. Transkripte werden in Supabase zwölf Monate gespeichert und danach automatisiert entfernt; Zusammenfassung, Bewertungen und Lernfortschritt bleiben erhalten. Nutzer können einzelne Sessions vollständig löschen. Provider-Audio ist in der versionierten Agentenkonfiguration deaktiviert.
