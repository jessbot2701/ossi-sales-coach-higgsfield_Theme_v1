# Korrekturprotokoll vom 20.10.2026

Grundlage: [kombinierter Review](Review_2026-10-20_Kombiniert.md). Umfang dieses Durchlaufs: Paket A sowie Paket B mit K01, K04, K06 und K14; K13 begleitet ausschließlich diese Änderungen.

## Arbeitsstand und Grenzen

- Ausgangs-HEAD: `defa3e32dcacf043bbf3e78c1d5976234344498f`.
- Der Arbeitsbaum war bereits verändert: zwölf modifizierte Dateien sowie unversionierte Reviews, Rollenspiel-Dokumentation, Fixture und Webhook-Tests. Diese Änderungen wurden erhalten. Insbesondere wurde die vorhandene Unterstützung mehrerer Rollenspiele nicht zurückgesetzt.
- Gelesen wurden die geltenden AGENTS-Vorgaben, der dort referenzierte `.claude/skills/higgsfield-website/SKILL.md`, README, Produktions-/Releasevorgaben und die ausgewählten Review-Abnahmen. Der Video-Website-Workflow ist für diese Korrekturen nicht einschlägig. Als Arbeitsdisziplin wurde `senior-engineering-execution` verwendet.
- Ein lokales Ausgangsmanifest mit Hashes und Sicherungskopien der gemeinsam bearbeiteten Dateien liegt im ignorierten Verzeichnis `artifacts/correction-2026-10-20/`. Die nicht ergänzten vorhandenen Änderungen wurden per Hash unverändert bestätigt. Beide Review-Dateien unter `docs/` sind gegenüber dem Ausgangsmanifest bytegleich; auch der äußere Copilot-Review wurde nicht bearbeitet.
- Keine Commits, Pushes, Deployments, Datenbankänderungen, Schlüsselrotationen, Historienumschreibungen oder echten Agentenreleases. Keine kostenpflichtigen Provideraufrufe. Die Release-Tests verwenden synthetische Zugangsdaten, eigene temporäre Dateien sowie vollständig ersetzte Netzwerk- und CLI-Grenzen.
- Commit/PR/Migration: entfällt in diesem ausdrücklich lokalen Durchlauf.

## K01 – Env-Tracking und Ignore-Regeln

**Status: geklärt, lokale Prävention ergänzt. Kein nachgewiesener Leak.**

### Befund

Die fehlende Ignore-Datei im äußeren Workspace war bestätigt. Eine daraus abgeleitete Secret-Exposition wurde durch die lokale Prüfung nicht bestätigt:

- `.git` liegt im äußeren Workspace; `core.worktree` verweist ausdrücklich auf `ossi-voice-coach`. Die äußere `.env` befindet sich damit außerhalb des aktuell konfigurierten Git-Arbeitsbaums.
- Aktuell getrackt sind nur `.env.example` und `elevenlabs/.env.example`. Die lokale `.env.local` ist nicht getrackt und wird wirksam ignoriert.
- Alle 34 über lokale Referenzen und Reflogs erreichbaren Commits wurden auf Env-Pfade geprüft. Es existieren nur zwei unterschiedliche Env-Blobs, beide Vorlagen mit Platzhaltern. Relevante Pfadhistorie: `57d81da` und `9a3aea1`.
- Weder ein konfiguriertes `core.excludesFile` noch aktive Regeln in `.git/info/exclude` tragen hier zum Schutz bei. Die inneren Regeln `.env`, `.env.*`, `!.env.example` sind maßgeblich.
- Es wurden keine Secret-Werte ausgegeben. Historische Inhalte wurden nur intern auf Vorlagen/Platzhalter geprüft.

### Änderung und Abnahme

Neu: `../.gitignore` mit `.env`, `.env.*` und Ausnahme `!.env.example`.

`git check-ignore -v --no-index` bestätigt den Ausschluss von `.env`, `.env.local`, `.env.production`, `elevenlabs/.env` und `elevenlabs/.env.local` im aktiven Arbeitsbaum. Die beiden `.env.example`-Pfade bleiben ausgenommen. Mit explizit auf den äußeren Workspace gesetztem `--work-tree` wurde außerdem die neue äußere Regel geprüft.

Tracking, wirksame Regeln und lokal erreichbare Historie sind geklärt. Rotation und Historienbereinigung sind mangels nachgewiesener Exposition nicht ausgelöst worden.

### Einschränkungen

Die äußere Ignore-Datei liegt außerhalb des aktuellen Git-Arbeitsbaums und erscheint deshalb nicht im inneren `git status`. Sie ist eine lokale Vorsorge für eine spätere Verwendung des äußeren Verzeichnisses als Arbeitsbaum. Nicht lokal vorhandene Remote-Historie, fremde Klone, Backups und unerreichbare/prunete Objekte sind nicht Gegenstand dieses Nachweises. Es wurde kein Remote-Fetch ausgeführt.

## K04 – Vollständige Bewertungsbelege

**Status: bestätigt und lokal behoben.**

### Befund und Änderung

`comparableMatch` akzeptierte sowohl „Quelle enthält Beleg“ als auch „Beleg enthält Quelle“. Dadurch genügte ein echter Nutzerbeitrag innerhalb eines erfundenen längeren Belegs. Zusätzlich entfernte die gemeinsame Normalisierung ganze Klammer- und Markup-Inhalte.

In `lib/coaching/evaluation-integrity.ts` gibt es nun einen getrennten, gerichteten Belegvergleich. Der gesamte normalisierte Beleg muss als zusammenhängende Folge vollständiger Wörter in einem zulässigen Nutzerbeitrag stehen. `evidence` und `improvement_evidence` verwenden dieselbe Regel. Der bestehende Vergleich zur Erkennung redundanter/übernommener Begründungen bleibt davon getrennt.

Zulässige Normalisierung: Unicode NFKC, deutsche Kleinschreibung, Satz-/Sonderzeichen als Worttrenner und zusammengefasster Leerraum. Texte innerhalb von Klammern oder Markup werden nicht gelöscht. Ein Teilzitat muss an Wortgrenzen beginnen und enden; mindestens zwölf normalisierte Zeichen bleiben erforderlich.

Die Extraktion verwirft zudem Bewertungs- und Verbesserungsbelege oberhalb von 20.000 getrimmten Zeichen vollständig, statt einen möglicherweise erfundenen Rest abzuschneiden.

### Abnahme und Tests

- Vorangestellte und angehängte erfundene Aussagen: abgelehnt.
- Versteckte Zusätze in eckigen Klammern und spitzen Klammern: abgelehnt.
- Bloß ähnliche Formulierungen und abgeschnittene Wörter: abgelehnt.
- Zulässige Original-/Teilzitate trotz Großschreibung, Unicode-Darstellung, Satzzeichen und Auslassungspunkten: akzeptiert; der gelieferte Beleg bleibt erhalten.
- Agententext, Coaching-Dialog, fehlende Phasengrenzen und ein noch nicht abgeschlossenes Rollenspiel legitimieren keine Bewertung. Die vorhandenen entsprechenden Tests bleiben grün.
- Für ungültige Belege prüft der echte Webhook-Handler mit gemockter Datenbank die tatsächlich an `upsert` übergebenen Felder: Score/Begründung/Beleg werden `null`, ungültige Verbesserungsbelege samt Empfehlung, Alternative und Priorität entfernt.
- Ein zusätzlicher Handler-Test prüft erfundene Zusätze jenseits des Extraktionslimits.
- Ausgangslauf für K04/K14: sieben fehlschlagende und 42 erfolgreiche Tests. Nach dem ersten Fix: 49/49 erfolgreich. Zusätzliche Randfalltests sind im abschließenden Gesamtlauf enthalten.

### Einschränkungen

Kein semantischer Paraphrasenabgleich und kein Zusammenfügen separater Nutzerbeiträge zu einem Zitat. Überlange oder zu kurze Belege bleiben konservativ unbewertet. Bestehende gespeicherte Bewertungen wurden nicht nachträglich verändert. Die gemeinsame Validierungsfunktion wird auch von den vorhandenen Recovery-/Bereinigungspfaden verwendet; diese Skripte wurden nicht ausgeführt.

## K14 – Strukturierte Stärken

**Status: bestätigt und lokal behoben.**

### Befund und Änderung

`extractPostCallAnalysis` verband ein Array mit `", "`. `sanitizeSessionStrengths` trennte es danach unter anderem an Kommas. Drei fachliche Stärken mit interner Interpunktion wurden dadurch in Fragmente zerlegt und teilweise durch das Dreierlimit verdrängt.

Strukturierte Arrays bleiben jetzt von der Extraktion über die Sanitierung bis zur Session-Schreiboperation Arrays. Dies gilt für `session_conclusion.strengths` und das unterstützte eigenständige `strengths`-Feld. Nicht-stringförmige und leere Arraywerte werden entfernt; gültige Einträge werden außen getrimmt, auf je 20.000 Zeichen begrenzt und auf höchstens drei Stärken beschränkt. Interne Kommas, Semikolons und Zeilenumbrüche definieren in Arrays keine neuen Einträge.

Altformat-Strings werden ausdrücklich separat behandelt: Zeilenumbrüche, Semikolons und Komma plus Leerraum trennen Einträge; führende Listenzeichen werden entfernt. Ein explizit leeres strukturiertes Array bleibt leer und wird nicht durch ein älteres Textfeld ersetzt.

### Abnahme und Tests

- Drei Stärken mit internen Kommas bleiben drei vollständige, unveränderte Texte in der tatsächlichen Session-Schreiboperation.
- Arraygrenzen bleiben auch bei Semikolon und Zeilenumbruch erhalten.
- Leere Arrays, Leertexte, unzulässige Arraywerte und `null` sind definiert behandelt.
- Nummerierte/mit Aufzählungszeichen versehene Listen sowie bisherige komma- und semikolongetrennte Altformate bleiben unterstützt.
- Ohne auswertbares Rollenspiel bleiben die sanitisierten Stärken leer.
- Die Array-Extraktion und der gespeicherte Session-Inhalt schlugen vor dem Fix fehl. Sämtliche neuen und vorhandenen Tests bestehen im abschließenden Gesamtlauf.

### Einschränkungen

Bei unstrukturierten alten Komma-Strings lässt sich Interpunktion nicht zuverlässig von Listentrennern unterscheiden; deren bestehende Interpretation bleibt ausdrücklich auf dieses Altformat begrenzt. Keine Migration bereits gespeicherter Fragmente. Die vorhandene deutsche Sprachauswahl/Fallback-Logik bleibt bestehen.

## K06 – Gate, Resume und Veröffentlichung desselben Stands

**Status: bestätigt und lokal behoben; kein echter Release ausgeführt.**

### Befund

Das ursprüngliche Gate lud die Konfiguration in den Speicher, während der spätere CLI-Push erneut die Arbeitsdateien las. Auch `release-from-invocation`, Remote-Prüfung und Smoke luden den aktuellen Arbeitsstand. Eine erfolgreiche Invocation für A konnte dadurch B veröffentlichen. Der Resume besaß keinen lokalen Nachweis, welcher Kandidat zur Invocation gehörte.

### Änderung

Der bestehende CLI-Releaseweg bleibt erhalten; eine neue Veröffentlichungsplattform oder Datenbank ist nicht erforderlich:

1. Agentenkonfiguration, Zielzuordnung, acht vollständige Testdefinitionen mit IDs und Gate-Regeln werden als SHA-256-adressierter Snapshot gespeichert und im laufenden Prozess rekursiv eingefroren.
2. Das vollständige Gate verwendet diesen Snapshot. Vor dem Start und nach Abschluss werden die Remote-Testdefinitionen überprüft. Pro Run muss außerdem `test_info` mit den Ausführungsparametern des Snapshots übereinstimmen; so reicht eine zwischenzeitlich zurückgesetzte Remote-Testdefinition nicht als Nachweis.
3. Die Invocation-Zuordnung wird exklusiv vor dem Polling persistiert. ID, Agent/Branch, Wiederholungszahl, vollständige Testmenge, eindeutige Runs und fachliche Passraten werden geprüft.
4. Resume lädt ausschließlich den durch die Invocation zugeordneten Snapshot und prüft dessen Hash und Policy. Fehlende, beschädigte oder unpassende Belege blockieren vor einem Provideraufruf. Es startet kein zweites vollständiges Gate.
5. Die CLI erhält eine eigene Arbeitskopie des Snapshots einschließlich Registry. Änderungen an den ursprünglichen Agenten-/Testdateien während des Gates oder vor Resume können den Push nicht verändern.
6. Remote-Prüfung und Smoke verwenden denselben Snapshot. Alle lokal konfigurierten Felder werden geprüft, nicht nur Prompt und Data Collection. Nach den Smokes erfolgt eine erneute Prüfung. Hash, Invocation, Gate-Ergebnis und Veröffentlichungsstatus werden gemeinsam nachvollziehbar gespeichert; auch fehlgeschlagene Veröffentlichungsversuche bleiben sichtbar.

Die Regeln und Belegdateien sind in [production-setup.md](production-setup.md#snapshot-wiederaufnahme-und-nachweis) dokumentiert. Erlaubte Konfigurationsnormalisierungen: JSON-Objektschlüsselreihenfolge und die vorhandene CLI-Kompatibilitätsregel `tools`/`tool_ids`. Provider-Metadaten außerhalb der konfigurierten Top-Level-Felder zählen nicht zum Konfigurationsvergleich. `test_info` enthält Ausführungsparameter ohne Test-Anzeigenamen. Unbekannte weitere Normalisierungen führen zum Abbruch.

### Abnahme und tatsächliche Tests

Der echte Skripteinstieg wird in isolierten temporären Verzeichnissen ausgeführt. Das Test-Preload ersetzt `fetch` vollständig und fängt `spawnSync` der ElevenLabs-CLI ab; der abgefangene Push liest tatsächlich die vorbereiteten Dateien.

- Vier gezielte Verhaltenstests gegen das originale, bei Beginn unveränderte Skript aus HEAD schlagen erwartungsgemäß fehl: Änderung während Gate, A/B-Resume, fremde Invocation ohne Snapshot und Remote-Abweichung außerhalb der bisherigen Prompt-/Collection-Prüfung.
- Der korrigierte Runner veröffentlicht in den lokalen Simulationen A trotz zwischenzeitlich geänderter Arbeitsdateien B.
- Unterbrochenes Polling lässt sich mit vorhandener Bindung wiederaufnehmen, ohne das vollständige Gate zu wiederholen.
- Alte Invocations ohne Snapshot, manipulierte Snapshot-Dateien, unpassende Invocation-Zuordnungen sowie fokussierte Gates/Smokes werden für Resume abgewiesen.
- Falscher Branch, falsche Invocation, falsche Wiederholungszahl, fehlende/zusätzliche/doppelte Runs, fehlende oder abweichende Testdefinitionen und ein fehlgeschlagenes Gate verhindern den Push.
- Remote-Drift stoppt den Ablauf und verhindert die nachfolgenden Smokes; der Veröffentlichungsnachweis vermerkt den Fehlschlag.
- Dokumentierte Normalisierungen werden akzeptiert, unbekannte zusätzliche Einstellungen innerhalb der Konfiguration abgewiesen.
- Erfolgreiche Simulationen enthalten eindeutig zugeordnete Snapshot-, Gate-, Veröffentlichungs- und Smoke-Nachweise.
- Die zwei bisherigen Quelltexttests zu Remote-Verifikation und Resume wurden durch diese Verhaltenstests ersetzt. Die übrigen Konfigurations-/Suiteprüfungen bleiben erhalten.

### Einschränkungen

Kein Live-Nachweis beim Provider und kein manueller Audio-Smoke in diesem Durchlauf. Die genutzten Antwortfelder wurden gegen offizielle API-Dokumentation und lokal installierte SDK-Typen geprüft; liefert der Provider `test_info` oder andere notwendige Nachweise nicht, blockiert der Runner. Ein solcher Live-Vertragsunterschied muss gezielt untersucht werden.

Die Hashes schützen gegen versehentliche Änderung/beschädigte Belege, nicht gegen einen Angreifer, der sämtliche lokalen Belege konsistent ersetzen kann. Parallel ausgeführte externe Veröffentlichungen sind betrieblich zu serialisieren. Ein Prozessabbruch zwischen Providerstart und persistierter Invocation-Zuordnung kann keinen automatischen Resume liefern. Ein Fehler nach dem Push kann den externen Schreibvorgang nicht rückgängig machen; es gibt keinen automatischen Rollback. Die Belegdateien müssen für Resume aufbewahrt werden.

## K13 – Gezielte Verhaltenstests dieses Durchlaufs

**Status: für Paket A/B umgesetzt; übergreifendes Review-Thema weiterhin offen.**

Der Befund unzureichender reiner Quelltextnachweise wurde insbesondere am bisherigen Release-Test bestätigt. Ergänzt wurden tatsächliche Extraktions-/Validierungsaufrufe, Webhook-Handler-Tests mit Prüfung der Datenbankschreibargumente und Release-Prozesstests mit isolierten Dateien und ersetzten externen Schnittstellen.

Diese Tests belegen die ausgewählten Fehlerentscheidungen. Sie sind ausdrücklich kein Nachweis für echte Postgres-Transaktionen, RLS, Receipt-Leases, konkurrierende Sessions oder Provider-Simulationen. Eine neue vollständige Testinfrastruktur und CI-Erweiterung waren nicht beauftragt.

## Abschließende lokale Prüfungen

Die Ausgaben liegen unter `artifacts/correction-2026-10-20/`; dieses Verzeichnis ist bereits durch die Projektregeln ignoriert.

| Prüfung | Tatsächliches Ergebnis |
|---|---|
| K04/K14 vor Korrektur, drei gezielte Testdateien | 7 fehlgeschlagen, 42 bestanden; erwartete Reproduktion |
| K04/K14 nach erster Korrektur | 49/49 bestanden; spätere Randfälle zusätzlich im Gesamtlauf |
| Vier K06-Regressionen gegen Originalskript | 4 fehlgeschlagen; erwartete Reproduktion |
| `npm test` am abschließenden Stand | 244/244 Tests in 36 Dateien bestanden, einschließlich 22 Release-Verhaltenstests |
| `npm run typecheck` | Bestanden; nach letzten Änderungen erneut geprüft |
| `npm run lint` | Bestanden; nach letzten Änderungen erneut geprüft |
| `npm run build` | Bestanden; nach letztem Extraktionsrandfall erneut geprüft |
| `git diff --check` | Bestanden |
| Erhalt der vorhandenen Änderungen/Reviews | Unberührte Dateien per Ausgangshash bestätigt; gemeinsame Dateien gezielt ergänzt |

Die erste Release-Test-Harness-Ausführung musste für Windows-Datei-URLs korrigiert werden; sie wurde nicht als fachliche Reproduktion gewertet. Ein anfänglicher Typecheck-Fehler durch als `.ts` abgelegte eigene Sicherungskopien wurde durch Umbenennen dieser Artefakte in Textdateien behoben. Beide Hilfsprobleme sind im finalen Stand beseitigt.

Nicht ausgeführt: produktionsnahe funktionale Skripte, Voice-E2E, Provider-Gates/-Smokes, Wartungsskripte und Datenbanktests. Die vorhandenen Browser-/Layout-E2E wurden für diese Backend-/Releasekorrekturen nicht erneut ausgeführt.

## Geänderte Dateien dieses Durchlaufs

Pfade relativ zum Repository, außer dem ausdrücklich äußeren Ignore-Pfad:

- `../.gitignore` – lokale äußere Env-Prävention.
- `lib/coaching/evaluation-integrity.ts` – gerichteter Belegnachweis, getrennte Array-/Altformatbehandlung.
- `lib/elevenlabs/analysis.ts` – Stärkenarrays erhalten, überlange Belege verwerfen.
- `scripts/elevenlabs-agent-release.mjs` – Snapshot, Resume-Bindung, isolierter Push, vollständige Verifikation.
- `tests/evaluation-integrity.test.ts`, `tests/analysis.test.ts`, `tests/roleplay-webhook.test.ts` – gezielte fachliche Regressionen.
- `tests/agent-release-behavior.test.ts`, `tests/fixtures/release-provider.mjs` – neue lokale Release-Verhaltenstests.
- `tests/agent-release.test.ts` – zwei ersetzte Quelltexttests entfernt.
- `README.md`, `docs/production-setup.md` – Release-/Resumeablauf.
- `docs/Korrekturprotokoll_2026-10-20.md` – dieses Protokoll.

## Nächster Schritt

Als Nächstes folgt **Paket C – Session-Lebenszyklus**: K02, K05, K07, K11, K16 und die dazugehörigen Teile von K19. Dafür Nutzungszähler, aktive Sessionzustände, Startkompensation und Bind-Wiederholungen gemeinsam betrachten. K13 weiter mit den jeweiligen Verhaltenstests begleiten; für Transaktions-/Parallelitätsgarantien eine isolierte echte Datenbank einsetzen. Die übrigen Pakete und die übergreifende Produktionsfreigabe bleiben offen.
