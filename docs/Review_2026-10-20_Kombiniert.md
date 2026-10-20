# Kombinierter Code-Review – Grundlage für Korrekturen

| Merkmal | Angabe |
|---|---|
| Projekt | Ossi – AI Sales Coach V2 (`ossi-voice-coach`) |
| Datum | 20.10.2026 |
| Zusammenführung | Codex |
| Quelle A | [Codex-Review vom 20.10.2026](Review_2026-10-20_Codex.md), Befunde R01–R13 sowie ergänzende Abschnitte |
| Quelle B | [GitHub-Copilot-/Claude-Review vom 20.10.2026](../../Code-Review_2026-10-20_GitHub-Copilot-Claude-Opus-5.5.md), Befunde F01–F27 sowie ergänzende Abschnitte |
| Zweck | Gemeinsames, priorisiertes Korrektur-Backlog mit nachvollziehbarer Herkunft und prüfbaren Abnahmekriterien |
| Bearbeitungsstand | Alle Korrekturen offen; bedingte Befunde zunächst zu verifizieren |
| Methode | Redaktionelle und fachliche Konsolidierung zweier statischer Reviews, keine erneute Quellcode- oder Laufzeitprüfung |

## 1. Gesamturteil und Grenzen

Die Anwendung besitzt nach beiden Ausgangsreviews eine solide technische Grundlage. Vor einem breiteren Produktiveinsatz müssen insbesondere Session-Limits, Webhook-Wiederaufnahme, Bewertungsbelege, Conversation-Bindung und Agentenrelease abgesichert werden. Zusätzlich besteht ein sofort zu klärendes Risiko der versehentlichen Versionierung von Secrets.

Die Grundarchitektur mit Next.js, Supabase und ElevenLabs kann beibehalten werden. Beide Quellen bewerten Modultrennung, Authentifizierung, RLS und Webhook-Signaturprüfung grundsätzlich positiv. Die wichtigsten Schwächen betreffen Zustandsübergänge zwischen Browser, Provider und Datenbank sowie Fehler- und Parallelitätsfälle. Eine vollständige Neuentwicklung wird durch die vorliegenden Befunde nicht begründet.

Die Einzelbewertungen von 6/10 und 6,5/10 werden nicht zu einer vermeintlich präzisen neuen Note verrechnet. Das gemeinsame Urteil lautet: **brauchbare Grundlage für einen kontrollierten Pilotbetrieb, aber relevanter Stabilisierungsbedarf vor breiter Nutzung**. Dies ist keine Betriebsfreigabe.

**Geltungsbereich dieses Dokuments:**

- Die beschriebenen Fehler stammen aus den beiden Ausgangsreviews. Deren Aussagen zur Verifikation werden übernommen und nicht als neue Verifikation ausgegeben.
- Beide Reviews beruhen auf statischer Analyse. Aktuelle Tests, Builds, produktive Konfigurationen und tatsächliche Ausnutzbarkeit wurden nicht nachgewiesen.
- Ein identischer Commit oder ein identischer Hash des Arbeitsstands beider Reviews ist nicht dokumentiert. Vor jeder Korrektur ist der Befund am dann aktuellen Stand zu bestätigen.
- Bei der Zusammenführung wurden keine Anwendungskorrekturen vorgenommen, keine Tests ausgeführt und keine externen Systeme abgefragt.
- Es gibt keinen nachgewiesenen P0-Befund. Ein Secret-Leak ist insbesondere nicht nachgewiesen.
- Die Abnahmekriterien und Umsetzungshinweise sind aus den Befunden abgeleitete Anforderungen, keine bereits bestandenen Prüfungen.

## 2. Prioritäten, Evidenz und Bearbeitungsregeln

### Prioritäten

| Priorität | Bedeutung |
|---|---|
| P0 | Nachgewiesenes unmittelbares kritisches Risiko; aktuell kein Befund dieser Kategorie |
| P1 | Vor breiterem Produktiveinsatz beheben beziehungsweise einen bedingten Verdacht verbindlich aufklären |
| P2 | Geplant korrigieren; Teilbereiche können je nach Nutzung und Produktentscheidung zusätzlich freigaberelevant sein |
| P3 | Härtung, Wartbarkeit oder Konfigurationspflege nach den zentralen Korrekturen |

### Evidenz

| Kürzel | Bedeutung |
|---|---|
| S | Im Ausgangsreview als statisch nachvollzogen beschrieben; bei der Konsolidierung nicht erneut geprüft |
| B | Bedingter Befund: lokale Beobachtung vorhanden, aber Auswirkung, Exposition oder produktive Einstellung offen |
| H | Hypothese beziehungsweise Robustheitsrisiko; vor einer Korrektur gezielt bestätigen |

**Bearbeitung:** Für jede K-ID zuerst den aktuellen Codebezug bestätigen, anschließend Korrektur und passende Regression absichern. Als Status eignen sich `offen`, `in Prüfung`, `bestätigt`, `in Arbeit`, `behoben`, `widerlegt` und `bewusst akzeptiert`. Bei Abschluss sind Commit/PR, Prüfnachweis und gegebenenfalls verbleibende Einschränkungen zu dokumentieren. Eine bewusste Risikoakzeptanz ist keine technische Behebung.

Vor Änderungen am Datenmodell sind Migration, Bestandsdaten und Wiederherstellung zu berücksichtigen. Bereits veröffentlichte Migrationen sollten durch neue Migrationen ergänzt werden. Konkrete Providermechanismen müssen vor ihrer Nutzung gegen die dann aktuelle Schnittstelle geprüft werden.

## 3. Konsolidierte Übersicht

Die 40 nummerierten Ausgangsbefunde sind in **30 Korrekturthemen** zusammengeführt: **6 P1, 19 P2 und 5 P3**. Die Zusammenführung reduziert Doppelzählungen, nicht die fachliche Abdeckung. Ergänzende Hinweise zu Monitoring und Prompt-Kontext sind ebenfalls berücksichtigt.

| ID | Prio | Evidenz | Korrekturthema | Herkunft |
|---|---|---|---|---|
| K01 | P1 | B | Secret-Tracking und Ignore-Regeln klären | F03 |
| K02 | P1 | S | Session-Limits unabhängig von löschbaren Sessions durchsetzen | R01 |
| K03 | P1 | S | Webhook-Claims, Abschluss und Wiederaufnahme absichern | R02, F01, F02 |
| K04 | P1 | S | Erfundenen Zusatztext in Bewertungsbelegen ablehnen | R03 |
| K05 | P1 | S | Netzwerkfehler beim Conversation-Bind abfangen | R04 |
| K06 | P1 | S | Agentenrelease an den getesteten Stand binden | R05 |
| K07 | P2 | S | Startfehler kompensieren und Provideraufrufe begrenzen | R06, F05 |
| K08 | P2 | S | Auswertung und Lernprofil konsistent aktualisieren | R07, F04 |
| K09 | P2 | B | Gesamte Bewertungshistorie auswerten | R08, F11 |
| K10 | P2 | B | Löschung und Aufbewahrung über alle Datenkopien klären | R09, F18 |
| K11 | P2 | B | Provider-Conversation serverseitig der Session zuordnen | R10, F25 |
| K12 | P2 | S | Kriterienversion und historische Lesbarkeit sichern | R11, F15 |
| K13 | P2 | S | Schutzwirkung durch Verhaltens- und Datenbanktests nachweisen | R12, F17 |
| K14 | P2 | S | Strukturierte Stärken ohne Informationsverlust verarbeiten | R13 |
| K15 | P2 | B | Vertrauenswürdigen Prompt-Kontext gegen Clientänderungen schützen | F06, Codex Abschnitt D |
| K16 | P2 | S | Bind-Erfolg anhand des tatsächlichen Schreibresultats prüfen | F07 |
| K17 | P2 | S | Rollenfehler bei Admin-Einladungen korrekt behandeln | F08 |
| K18 | P2 | B | Letzten aktiven Admin auch bei Parallelität erhalten | F09 |
| K19 | P2 | S | Entscheidungsrelevante Datenbankfehler explizit behandeln | F10 |
| K20 | P2 | S | Personenbezogene Einmal-Skripte durch sichere Wartungswerkzeuge ersetzen | F12 |
| K21 | P2 | S | Recovery gegen unbeabsichtigtes Überschreiben absichern | F13, Codex Abschnitt C |
| K22 | P2 | S | Kriterien zwischen DB, Extraktion und Agent konsistent halten | F14 |
| K23 | P2 | S | Adminlisten vollständig und nachvollziehbar paginieren | F16 |
| K24 | P2 | H | Phasenerkennung gegen sprachliche Variation absichern | F19 |
| K25 | P2 | S | JSON-Parsing, Body-Limits und Feldgrenzen vereinheitlichen | F20, F21 |
| K26 | P3 | S | CSP gezielt härten | F22 |
| K27 | P3 | H | Unbenötigte Agent-Uploads prüfen und deaktivieren | F23 |
| K28 | P3 | H | Tatsächliche Passwort- und Admin-Authentifizierung prüfen | F24 |
| K29 | P3 | S | Repository-Artefakte und leere Routenordner bereinigen | F26 |
| K30 | P3 | H | Seed-Konfiguration auflösen | F27 |

## 4. P1-Befunde und Abnahme

### K01 – Secret-Tracking und Ignore-Regeln klären

**Herkunft:** F03. **Status:** offen, Exposition ungeklärt.

**Codebezug:** Workspace-Root `.env`, Root-Ignore-Regeln, `ossi-voice-coach/.gitignore` und Git-Tracking/History. Secret-Werte gehören weder in dieses Dokument noch in Prüfprotokolle.

**Befund und Auswirkung:** Laut Copilot liegen sensible Schlüssel in einer Root-`.env`, während eine Root-`.gitignore` fehlt. Daraus ergibt sich ein Risiko versehentlicher Versionierung. Ob die Datei getrackt, historisch committed oder durch andere Regeln ausgeschlossen ist, wurde nicht geprüft.

**Korrekturziel:** Wirksame Ignore-Regeln und belastbare Klärung der Exposition. Eine fehlende Root-`.gitignore` allein beweist keinen Leak; globale Regeln und `.git/info/exclude` können relevant sein. Eine neue Ignore-Regel entfernt bereits getrackte Dateien nicht aus dem Index oder der Historie.

**Abnahmekriterien:**

- Aktueller Tracking-Status, wirksame Ignore-Regeln und relevante Historie sind ohne Ausgabe von Secret-Werten geprüft und dokumentiert.
- Sensible lokale Env-Dateien sind wirksam ausgeschlossen; ungefährliche Vorlagen bleiben verwendbar.
- Bei bestätigter Exposition sind betroffene Schlüssel ersetzt beziehungsweise widerrufen und die Anwendungen auf die Ersatzwerte umgestellt.
- Eine gegebenenfalls erforderliche Historienbereinigung ist koordiniert; sie ersetzt keine Schlüsselrotation.
- Falls keine Exposition vorliegt, ist dies als Prüfergebnis statt als „behobener Leak“ dokumentiert.

### K02 – Session-Limits unabhängig von löschbaren Sessions durchsetzen

**Herkunft:** R01. **Codebezug:** `app/api/sessions/start/route.ts`, `app/api/sessions/[id]/route.ts`, Datenbankregeln für offene Sessions.

**Befund und Auswirkung:** Die Sequenz `Start → eigene Session löschen → Start` entfernt laut Review sowohl die Zählgrundlage des Stundenlimits als auch die Grundlage der Sperre offener Sessions. Bereits ausgegebene Providerzugänge oder laufende Gespräche werden dadurch nicht automatisch beendet. Kosten- und Parallelitätsbegrenzung sind umgehbar.

**Korrekturziel:** Atomare Nutzungszählung unabhängig von löschbaren Trainingsinhalten. Aktive Providerverbindungen und lokale Sessionzustände benötigen einen abgestimmten Abschlussprozess. Aufbewahrung minimaler Zählerdaten mit K10 abstimmen.

**Abnahmekriterien:**

- Löschen eigener Sessions setzt das Stundenkontingent nicht zurück.
- Gleichzeitige Starts überschreiten weder Kontingent noch erlaubte Parallelität.
- Löschen oder Abbrechen einer aktiven Session ermöglicht keine zusätzlichen unkontrollierten Providerverbindungen.
- Zustände nach verspäteten Bind-Requests und Webhooks sind definiert; gelöschte Inhalte werden nicht wiederhergestellt.
- API-Verhalten ist unabhängig von UI-Sperren getestet.

### K03 – Webhook-Claims, Abschluss und Wiederaufnahme absichern

**Herkunft:** R02, F01, F02; Monitoring aus Copilot Abschnitten D/E. **Codebezug:** `supabase/migrations/20260719210605_init_coaching_platform.sql`, `app/api/webhooks/elevenlabs/route.ts`.

**Befund und Auswirkung:** Nach einem harten Prozessabbruch bleibt ein Receipt auf `processing`. Wiederholungen werden als Duplikate mit HTTP 200 bestätigt. Zusätzlich bleiben Fehler des abschließenden `finish_webhook_receipt` unbeachtet. Auswertungen können dauerhaft fehlen.

**Korrekturziel:** Zeitlich begrenzter Claim mit atomarer Übernahme, eindeutigem Versuchstoken und wiederholbarer Verarbeitung. Ein alter Worker darf nach Übernahme durch einen neuen Worker keine gültigen Ergebnisse mehr überschreiben. Abschlussstatus und fachliche Writes müssen mit K08 abgestimmt sein.

**Abnahmekriterien:**

- Ein simulierter Prozessabbruch nach Claim wird durch erneute Zustellung oder einen dokumentierten Recovery-Mechanismus automatisch aufgeholt.
- Mehrere gleichzeitige Zustellungen und Reclaims erzeugen keine mehrfachen fachlichen Auswirkungen.
- Ein alter Worker wird nach Claim-Übernahme bei seinen weiteren Schreibversuchen zuverlässig abgewehrt.
- Fehler beim Receipt-Abschluss werden erkannt und führen zu einem definierten, wiederherstellbaren Zustand.
- HTTP-Erfolg bedeutet abgeschlossene Verarbeitung oder nachweislich dauerhafte Übernahme in eine verlässliche Verarbeitung; `processing` allein genügt nicht.
- Überfällige Claims und wiederholt fehlgeschlagene Verarbeitungen sind mit konfigurierten Schwellen erkennbar und alarmierbar.

### K04 – Erfundenen Zusatztext in Bewertungsbelegen ablehnen

**Herkunft:** R03. **Codebezug:** `lib/coaching/evaluation-integrity.ts`.

**Befund und Auswirkung:** Ein längerer angeblicher Beleg wird akzeptiert, wenn er einen echten Nutzerbeitrag enthält. Beispiel: Aus „Guten Tag, mein Name ist Weiß.“ kann ein akzeptierter Beleg mit dem erfundenen Zusatz „Ich garantiere Ihnen 50 Prozent Einsparung.“ werden.

**Korrekturziel:** Der vollständige behauptete Beleg muss im zulässigen Nutzertext nachweisbar sein. Belegnachweis und Erkennung redundanter Begründungen getrennt behandeln.

**Abnahmekriterien:**

- Erfunden angehängte oder vorangestellte Aussagen werden abgelehnt.
- Echte, zulässige Zitate bleiben unter den dokumentierten Normalisierungsregeln gültig.
- Agententext, falsche Rollenspielphase und ausschließlich ähnliche Aussagen legitimieren keinen Nutzerbeleg.
- Die Regeln gelten für `evidence` und `improvement_evidence`.
- Regressionstests prüfen die tatsächliche Bewertungsentscheidung samt gespeichertem Beleg.

### K05 – Netzwerkfehler beim Conversation-Bind abfangen

**Herkunft:** R04. **Codebezug:** `components/training-launcher.tsx`.

**Befund und Auswirkung:** Eine HTTP-Fehlerantwort wird behandelt, eine geworfene `fetch`-Ausnahme im später ausgeführten Callback jedoch nicht zuverlässig durch den äußeren Formular-Catch abgefangen. Ein Gespräch kann ohne gespeicherte Conversation-Zuordnung weiterlaufen.

**Korrekturziel:** Lokale Fehlerbehandlung im Callback, begrenzte idempotente Wiederholung und kontrollierter Abbruch bei endgültigem Fehlschlag. Mit K07, K11 und K16 abstimmen.

**Abnahmekriterien:**

- Netzwerkfehler im Callback erzeugen keine unbehandelte Promise-Rejection.
- Wiederholungen derselben Bindung sind sicher, auch wenn die erste Antwort nach erfolgreichem Datenbankwrite verloren geht.
- Nach ausgeschöpften Versuchen wird die Verbindung kontrolliert beendet und der lokale Sessionzustand bereinigt.
- Nutzer erhalten einen zutreffenden Status und können nach Abschluss der Bereinigung erneut starten.

### K06 – Agentenrelease an den getesteten Stand binden

**Herkunft:** R05. **Codebezug:** `scripts/elevenlabs-agent-release.mjs`, insbesondere `release-from-invocation`.

**Befund und Auswirkung:** Ein bestandener Testlauf für Konfiguration A kann laut Review zur Veröffentlichung einer inzwischen geänderten Datei B verwendet werden. Auch ein laufendes Gate ist von zwischenzeitlichen Dateiänderungen betroffen.

**Korrekturziel:** Unveränderlichen Release-Snapshot mit Hash, relevanten Agenten-/Testdefinitionen und zugehöriger Invocation erzeugen. Genau diesen Stand testen, veröffentlichen und nachprüfen.

**Abnahmekriterien:**

- Änderungen nach Testbeginn verändern den veröffentlichten Snapshot nicht.
- Resume lehnt fehlenden oder nicht passenden Nachweis ab beziehungsweise verwendet ausschließlich den unveränderlich zugeordneten geprüften Snapshot.
- Hash, Invocation, Ergebnisse und veröffentlichter Stand sind eindeutig nachvollziehbar.
- Remote-Verifikation vergleicht mit dem freigegebenen Snapshot und berücksichtigt nur dokumentierte Normalisierungen.
- Nachgelagerte Smokes ersetzen nicht den Nachweis für das vollständige Gate.

## 5. P2-Befunde und Abnahme

### K07 – Startfehler kompensieren und Provideraufrufe begrenzen

**Herkunft:** R06, F05. **Codebezug:** `app/api/sessions/start/route.ts`, `components/training-launcher.tsx`.

**Befund:** Nach Sessionanlage können Netzwerkfehler, ungültiges JSON, schemawidrige Providerantworten oder SDK-Verbindungsfehler eine offene Session hinterlassen. Weitere Starts werden bis zur Bereinigung blockiert.

**Korrektur:** Sessionbezogene Kompensation für den gesamten Startablauf; Timeout und expliziter, autorisierter Abbruchpfad. Nur noch vorbereitete beziehungsweise tatsächlich abzubrechende Zustände schließen, keine inzwischen erfolgreich aktive Session pauschal per `finally` überschreiben.

**Abnahme:** HTTP-Fehler, Timeout, Netzwerkfehler, ungültiges JSON, falsches Antwortschema und SDK-Fehler führen zu definierten Zuständen. Ein erneuter Start ist nach kontrolliertem Abschluss möglich. Späte Antworten und konkurrierende Bindungen werden sicher behandelt.

### K08 – Auswertung und Lernprofil konsistent aktualisieren

**Herkunft:** R07, F04. **Codebezug:** `lib/coaching/recompute.ts`, `app/api/webhooks/elevenlabs/route.ts`, `app/api/sessions/[id]/route.ts`.

**Befund:** Bewertungen, Sessionstatus, Fortschritt und Lernprofil werden separat geschrieben. Teilfehler hinterlassen widersprüchliche Zustände; eine ältere parallele Berechnung kann neuere Ergebnisse überschreiben. Eine bereits gelöschte Session kann nicht durch erneutes DELETE zur Reparatur genutzt werden.

**Korrektur:** Zusammengehörige Datenbankwrites transaktional ausführen oder durch ein dokumentiertes, versioniertes Verarbeitungsmodell absichern. Berechnungen pro Nutzer serialisieren beziehungsweise veraltete Writes abweisen. Reparatur unabhängig vom Vorhandensein der ursprünglichen Session ermöglichen.

**Abnahme:** Fehler an jedem relevanten Schreibschritt hinterlassen einen konsistenten oder nachweislich automatisch reparierbaren Zustand. Gleichzeitige Webhooks und Löschungen verlieren keine Änderungen. Entfernte Bewertungen verschwinden aus Aggregaten. Wiederholungen sind idempotent. Ein Upsert ohne vorheriges Delete allein genügt nicht als Nachweis.

### K09 – Gesamte Bewertungshistorie auswerten

**Herkunft:** R08, F11. **Codebezug:** `lib/coaching/recompute.ts`, `supabase/config.toml`.

**Befund:** Der unpaginierte Abruf kann am lokal konfigurierten Limit von 1.000 Zeilen abgeschnitten werden. Bei sechs gültigen Kriterienbewertungen pro Session wird diese Grenze während der 167. Session überschritten. Das produktive Limit ist offen.

**Korrektur:** SQL-Aggregation oder vollständige deterministische Pagination, abgestimmt mit dem Konsistenzmodell aus K08.

**Abnahme:** Datensätze unter, auf und über der Abrufgrenze ergeben korrekte Anzahl, Mittelwert, jüngsten Score und Trend. Die Reihenfolge ist eindeutig, auch bei gleichen Zeitstempeln. Unvollständige oder abgebrochene Abrufe ersetzen keine vollständigen Aggregate.

### K10 – Löschung und Aufbewahrung über alle Datenkopien klären

**Herkunft:** R09, F18. **Codebezug:** Retention-Funktion in `supabase/migrations/20260719210605_init_coaching_platform.sql`, `elevenlabs/agent_configs/Coaching-Kaltakquise-V2.0.json`, Löschrouten, `components/training-launcher.tsx`, `docs/production-setup.md`.

**Befund:** Lokale Löschung beauftragt laut Review keine Löschung der Providerkopie. Die Zwölfmonatsbereinigung entfernt `transcript`, lässt aber wörtliche Belege bestehen. Einwilligung und Löschbestätigung können eine andere Reichweite vermitteln als die technische Umsetzung. Produktive Retention wurde nicht geprüft.

**Korrektur:** Verbindliche Matrix für Datenart, Speicherort, Zweck, Frist und Löschereignis erstellen. Providerkopien, Audio soweit vorhanden, Transkript, Belege, abgeleitete Daten und technische Minimaldaten berücksichtigen. Dies ist eine technische Konsistenzaufgabe, kein aus den Reviews ableitbares rechtliches Urteil.

**Abnahme:** Produktive Einstellungen sind mit dem beschlossenen Konzept abgeglichen. Löschaufträge sind wiederholbar, ihr Status ist nachvollziehbar und notwendige Zuordnungen bleiben bis zur Bestätigung erhalten. Bereinigung berücksichtigt Belegfelder und Bewertungsconstraints. UI-Texte beschreiben den tatsächlichen Umfang; späte Webhooks stellen gelöschte Inhalte nicht wieder her.

### K11 – Provider-Conversation serverseitig der Session zuordnen

**Herkunft:** R10, F25. **Codebezug:** `app/api/sessions/[id]/bind/route.ts`, Start- und Webhook-Route.

**Befund:** Die API prüft die eigene lokale Session, bestätigt aber nicht die Herkunft der clientseitig behaupteten Conversation-ID. Praktische Ausnutzung setzt die Kenntnis einer fremden, noch nicht gebundenen ID voraus; ein Weg zu deren Beschaffung wurde nicht nachgewiesen.

**Korrektur:** Integritätsgeschützte, serverseitig verifizierbare Korrelation zwischen autorisiertem Start, Session und Provider-Conversation. Eine weitere frei behauptete Nutzer-ID genügt nicht.

**Abnahme:** Eigene Conversations lassen sich binden; bekannte fremde Test-IDs, wiederverwendete Nachweise und nachträglich veränderte Zuordnungen werden abgewiesen. Späte oder wiederholte Webhooks erhalten dieselbe überprüfte Zuordnung. Die tatsächlich verfügbare Providerunterstützung ist vor Implementierung bestätigt.

### K12 – Kriterienversion und historische Lesbarkeit sichern

**Herkunft:** R11, F15. **Codebezug:** `app/api/webhooks/elevenlabs/route.ts`, `supabase/migrations/20260727070000_optimize_query_paths.sql`, Session-/Trainingsversionierung.

**Befund:** Der Webhook lädt aktuell aktive Kriterien statt des beim Sessionstart geltenden Sets. Deaktivierte Kriterien können durch RLS für historische Bewertungen unsichtbar werden.

**Korrektur:** Unveränderliches Kriterien-Set an Trainingsversion beziehungsweise Session binden; historische Namen, Bedeutung und Sortierung erhalten. IDs allein reichen nicht, wenn deren Definition später veränderlich bleibt.

**Abnahme:** Eine unter Version A gestartete Session wird nach Aktivierung von B weiterhin mit A ausgewertet. Historische Ergebnisse bleiben für berechtigte Nutzer vollständig lesbar. Bestandsdaten erhalten eine dokumentierte Zuordnung oder eine sichtbare Kennzeichnung fehlender Versionsinformation.

### K13 – Schutzwirkung durch Verhaltens- und Datenbanktests nachweisen

**Herkunft:** R12, F17. **Codebezug:** `tests/session-start-security.test.ts`, `tests/roleplay-webhook.test.ts`, API-/SQL-Testinfrastruktur.

**Befund:** Quelltext-Assertions und vereinfachte Mocks belegen zentrale Sicherheits-, Retry- und Parallelitätsgarantien nicht. Vorhandene Fachlogiktests und operative Integrationsskripte bleiben wertvoll.

**Korrektur:** Die Tests jeweils mit der fachlichen Korrektur ergänzen. Reale SQL-Zustände, Rollen und Locks in einer isolierten Datenbank prüfen; Handler-Tests für API-Fehler und Autorisierung einsetzen. Quelltextprüfungen nur als Ergänzung verwenden.

**Abnahme:** Tests decken die in K02–K12 und K16–K19 beschriebenen kritischen Sequenzen ab. RLS wird mit relevanten Rollen gegen eine echte Testdatenbank geprüft. Die CI führt die für die Änderung notwendigen Tests reproduzierbar aus; Testdaten und Zugangsdaten sind isoliert. Ein grüner Textvergleich gilt nicht als bestandener Verhaltenstest.

### K14 – Strukturierte Stärken ohne Informationsverlust verarbeiten

**Herkunft:** R13. **Codebezug:** `lib/elevenlabs/analysis.ts`, `lib/coaching/evaluation-integrity.ts`.

**Befund:** Ein Array wird mit Kommas verbunden und später an Kommas getrennt. Normale Interpunktion erzeugt falsche Einträge und kann durch die Begrenzung auf drei Stärken echte Inhalte verdrängen.

**Korrektur:** Strukturierte Arrays durchgehend erhalten; unstrukturierte Altformate gesondert behandeln.

**Abnahme:** Drei Stärken bleiben trotz Kommas innerhalb ihrer Texte drei unveränderte Einträge. Leere Werte und unterstützte Altformate werden definiert behandelt.

### K15 – Vertrauenswürdigen Prompt-Kontext gegen Clientänderungen schützen

**Herkunft:** F06, Codex Abschnitt D. **Codebezug:** `app/api/sessions/start/route.ts`, `components/training-launcher.tsx`, Agentenprompt.

**Befund:** Serverseitig berechnete Dynamic Variables werden über den Browser an den Provider übergeben. Ein veränderter Client kann sie ersetzen. Besonders relevant sind als interne Anweisung verwendete Werte wie `context_collection_instruction`. Ein erfolgreicher Angriff auf die Bewertung wurde nicht nachgewiesen.

**Korrektur:** Vertrauenswürdige Steuerinformationen und freie Nutzereingaben unterscheiden. Steuerinformationen über eine verifizierte serverseitige Übergabe oder einen gleichwertigen Schutz absichern. Providerfähigkeiten zunächst prüfen.

**Abnahme:** Manipulierte Steuerwerte werden vor ihrer Verwendung verhindert oder nicht als vertrauenswürdige Anweisung interpretiert. Legitime Nutzereingaben bleiben möglich. Tests mit verändertem Client belegen die gewählte Grenze. Ein Vergleich erst im Post-Call-Webhook ist nur nachträgliche Erkennung und allein keine Prävention.

### K16 – Bind-Erfolg anhand des tatsächlichen Schreibresultats prüfen

**Herkunft:** F07. **Codebezug:** `app/api/sessions/[id]/bind/route.ts`.

**Befund:** Ein bedingtes Update prüft den Fehlerwert, aber nicht die Anzahl betroffener Zeilen. Ein unterlegener paralleler Bind kann fälschlich `{bound:true}` erhalten.

**Korrektur:** Schreibresultat beziehungsweise aktuellen Zustand prüfen. Identische Wiederholung idempotent behandeln; widersprüchliche Bindung als Konflikt melden.

**Abnahme:** Bei zwei verschiedenen gleichzeitigen Conversation-IDs gewinnt genau eine. Die andere erhält einen definierten Konflikt. Eine Wiederholung derselben erfolgreich gespeicherten ID gilt als Erfolg, auch nach verlorener erster Antwort. Datenbankfehler werden nicht als Erfolg ausgegeben.

### K17 – Rollenfehler bei Admin-Einladungen korrekt behandeln

**Herkunft:** F08. **Codebezug:** `app/api/admin/invitations/route.ts`.

**Befund:** Ein Fehler beim `app_roles.upsert` kann eine erfolgreiche Admin-Einladung vortäuschen, obwohl die gewünschte Rolle nicht vergeben wurde.

**Korrektur:** Ergebnis prüfen; Teilerfolg sichtbar und reparierbar machen. Auth-Einladung und Rollenwrite als getrennte Operationen berücksichtigen.

**Abnahme:** Ein provozierter Rollenfehler erzeugt keine uneingeschränkte Erfolgsmeldung. Ein erneuter Versuch repariert den Zustand ohne doppelte beziehungsweise widersprüchliche Benutzeranlage. Bestehende Accounts werden durch eine pauschale Kompensation nicht gelöscht.

### K18 – Letzten aktiven Admin auch bei Parallelität erhalten

**Herkunft:** F09. **Codebezug:** `app/api/admin/users/[id]/route.ts`, Rollen-/Aktivstatusmodell.

**Befund:** Getrennte Prüfung und Änderung können bei parallelen Sperr- oder Löschaktionen den Schutz des letzten aktiven Admins umgehen. Der konkrete Ablauf ist zu reproduzieren.

**Korrektur:** Gemeinsame Invariante für alle relevanten Sperr-, Rollenwechsel- und Löschpfade definieren und serialisieren. Bei externer Auth-Löschung die Systemgrenze berücksichtigen; eine lokale Transaktion umfasst nicht automatisch den externen Aufruf.

**Abnahme:** Konkurrierende Aktionen gegen die letzten zwei aktiven Admins lassen mindestens einen handlungsfähigen Admin bestehen. Fehler zwischen Rollen-/Statusänderung und Auth-Operation führen zu einem definierten, reparierbaren Zustand.

### K19 – Entscheidungsrelevante Datenbankfehler explizit behandeln

**Herkunft:** F10. **Codebezug:** Sessionstart, Bind-Route und Webhook-Route.

**Befund:** Mehrere Queries werten nur `data` aus. Technische Fehler erscheinen als „nicht gefunden“, „nicht gebunden“ oder leeres Lernprofil.

**Korrektur:** Fehler, fehlenden Datensatz und zulässigen leeren Zustand unterscheiden. Nur ausdrücklich erlaubte optionale Daten dürfen mit einem Fallback weiterverarbeitet werden.

**Abnahme:** Kontrolliert ausgelöste Lesefehler führen zu zutreffenden Fehlerantworten beziehungsweise Retry-Zuständen und keinen falschen fachlichen Entscheidungen. Fehlende Datensätze behalten den vorgesehenen API-Vertrag. Logs enthalten eine Korrelation, aber keine unnötigen sensiblen Inhalte.

### K20 – Personenbezogene Einmal-Skripte durch sichere Wartungswerkzeuge ersetzen

**Herkunft:** F12. **Codebezug:** `scripts/backfill-christian-20260729.mts`, `tests/christian-backfill.test.ts`, `package.json`.

**Befund:** Laut Review enthält ein Einmal-Skript reale Nutzer-/Sessionbezüge und Transkriptausschnitte und schreibt privilegiert ohne Dry-run.

**Korrektur:** Reale Inhalte aus der aktiven Codebasis durch synthetische Testdaten ersetzen. Wartung über parametrisierte Werkzeuge mit Vorschau, eng begrenzter Zielmenge und expliziter Schreiboption. Historische Verbreitung separat prüfen.

**Abnahme:** Code, Tests und Package-Skripte enthalten die betreffenden realen Inhalte nicht mehr. Dry-run schreibt nichts und zeigt die vorgesehenen Änderungen. Schreibausführung betrifft ausschließlich angegebene Ziele. Eine erforderliche Historienbereinigung wird begründet und koordiniert; sie wird nicht blind aus dem Review abgeleitet.

### K21 – Recovery gegen unbeabsichtigtes Überschreiben absichern

**Herkunft:** F13, Codex Abschnitt C. **Codebezug:** `scripts/recover-elevenlabs-sessions.mts`, `docs/multiple-roleplays.md`.

**Befund:** Recovery kann abgeschlossene Sessions ohne Prüfung des erwarteten Ausgangsstands überschreiben. Doppelte Verarbeitungslogik in Webhook und Recovery erhöht das Abweichungsrisiko.

**Korrektur:** Vorschau, explizite Zielauswahl und Compare-and-Set für Updates; abgeschlossene Sessions standardmäßig schützen. Fachliche Verarbeitung möglichst gemeinsam nutzen, Eingangswege getrennt halten.

**Abnahme:** Eine nach der Vorschau veränderte Session wird nicht überschrieben. Nicht ausgewählte und abgeschlossene Sessions bleiben standardmäßig unberührt. Wiederholung ist sicher. Webhook und Recovery liefern für dieselben freigegebenen Eingangsdaten dieselben fachlichen Ergebnisse.

### K22 – Kriterien zwischen DB, Extraktion und Agent konsistent halten

**Herkunft:** F14. **Codebezug:** `lib/elevenlabs/analysis.ts`, Webhook-Route, Kriterien-Datenmodell und Agenten-Data-Collection-Konfiguration.

**Befund:** Die Datenbank ist konfigurierbar, die Extraktion kennt jedoch nur sechs feste Slugs. Neue Kriterien können still unbewertet bleiben.

**Korrektur:** Gemeinsame Definition oder verbindliche Konsistenzprüfung zwischen Kriterienversion, Extraktion und Agentenfeldern. Mit K06 und K12 abstimmen.

**Abnahme:** Ein neu aktiviertes, nicht unterstütztes Kriterium blockiert die Freigabe mit verständlicher Meldung. Unterstützte neue Kriterien werden vollständig verarbeitet. Historische Versionen bleiben auswertbar.

### K23 – Adminlisten vollständig und nachvollziehbar paginieren

**Herkunft:** F16. **Codebezug:** `app/admin/sessions/page.tsx`, `app/admin/users/page.tsx`.

**Befund:** Feste Limits von 200 Sessions beziehungsweise 1.000 Nutzern können Listen ohne Hinweis abschneiden.

**Korrektur:** Stabile Pagination, verständlicher Umfang und geeignete Filter; angezeigte Gesamtzahlen müssen tatsächlich ermittelt sein.

**Abnahme:** Alle berechtigten Datensätze oberhalb der bisherigen Limits sind erreichbar. Seitenwechsel und Filter verursachen bei unverändertem Datenbestand keine Lücken oder Duplikate. Die Oberfläche verspricht keine Vollständigkeit für einen bloßen Ausschnitt.

### K24 – Phasenerkennung gegen sprachliche Variation absichern

**Herkunft:** F19. **Codebezug:** `lib/coaching/transcript-phases.ts`, Agentenprompt/-konfiguration.

**Befund:** Phasengrenzen werden aus Agentenformulierungen abgeleitet. Variationen können gültige Rollenspiele unbewertet lassen. Der konservative Umgang mit unklaren Phasen ist zugleich ein Integritätsschutz.

**Korrektur:** Zunächst repräsentative Varianten prüfen. Falls nötig, verlässliches strukturiertes Phasensignal ergänzen und Textparser als definierten Fallback verwenden. Verfügbarkeit und Vertrauenswürdigkeit des Signals prüfen.

**Abnahme:** Varianten, mehrere Rollenspiele und unklare Übergänge sind abgedeckt. Zusätzliche Erkennung bewertet keine Coaching- oder Agentenpassagen irrtümlich als Nutzerleistung. Bei fehlendem zuverlässigem Signal bleibt die Auswertung konservativ und nachvollziehbar.

### K25 – JSON-Parsing, Body-Limits und Feldgrenzen vereinheitlichen

**Herkunft:** F20 und F21; gemeinsame Priorität P2 wegen des API-Fehlervertrags. **Codebezug:** `lib/request-body.ts`, `lib/api.ts`, Sessionstart und weitere Routen mit direktem `request.json()`.

**Befund:** Ungültiges JSON kann als HTTP 500 enden. Ein frühes Body-Limit und die Schema-Grenze für `conversationOccasion` fehlen in den beschriebenen Pfaden.

**Korrektur:** Vorhandenen begrenzten Parser prüfen und konsistent einsetzen; syntaktische, fachliche und technische Fehler unterscheiden.

**Abnahme:** Ungültiges JSON liefert 400, zu große Bodies die definierte Größenfehlerantwort, beispielsweise 413. Das Limit greift auch ohne vertrauenswürdigen `Content-Length`-Header. Die vorgesehene 500-Zeichen-Grenze wird im Schema geprüft. Gültige Grenzfälle bleiben nutzbar.

## 6. P3-Befunde und Abnahme

### K26 – CSP gezielt härten

**Herkunft:** F22. **Codebezug:** `next.config.ts`.

**Befund:** `script-src 'unsafe-inline'` ist laut Review vorhanden; ein ausnutzbarer HTML-Sink wurde nicht gefunden.

**Korrektur und Abnahme:** Anforderungen der Anwendung prüfen und eine geeignete Nonce-/Hash-basierte Strategie umsetzen, falls kompatibel. Geschützte Seiten, Authentifizierung, erforderliche Skripte und Voice-Funktionen müssen weiterhin funktionieren. Keine Behauptung einer bestehenden XSS-Lücke allein aus der CSP ableiten.

### K27 – Unbenötigte Agent-Uploads prüfen und deaktivieren

**Herkunft:** F23. **Codebezug:** `elevenlabs/agent_configs/Coaching-Kaltakquise-V2.0.json`.

**Befund:** In der lokalen Konfiguration erscheinen Datei-Uploads aktiviert; tatsächliche Nutzung und Remote-Einstellung sind offen.

**Korrektur und Abnahme:** Bedarf und wirksame Konfiguration prüfen. Nicht benötigte Uploads lokal und beim Provider deaktivieren und über den Releaseprozess absichern. Benötigte Funktionen bleiben nachweislich nutzbar.

### K28 – Tatsächliche Passwort- und Admin-Authentifizierung prüfen

**Herkunft:** F24. **Codebezug:** `supabase/config.toml`, produktive Auth-Konfiguration.

**Befund:** Lokale Mindestlänge sechs Zeichen; produktive Einstellung und weitere Schutzmaßnahmen ungeprüft.

**Korrektur und Abnahme:** Tatsächliche Passwortregeln und Adminschutz erfassen, Zielvorgaben festlegen und die in F24 vorgeschlagenen Maßnahmen wie längere Passwörter und Admin-MFA bewerten. Einladung, Reset, Anmeldung und Wiederherstellung mit den beschlossenen Regeln prüfen. Lokale Defaults nicht als nachgewiesenen Produktionszustand ausgeben.

### K29 – Repository-Artefakte und leere Routenordner bereinigen

**Herkunft:** F26. **Codebezug:** `app/qa-dashboard`, `app/qa-help`, `app/qa-session`, `app/qa-training` sowie Screenshots und Audiodatei im Workspace-Root.

**Befund:** Leere Ordner und mögliche Arbeitsartefakte erschweren die Übersicht. Nutzung und Tracking müssen vor Entfernung geprüft werden.

**Korrektur und Abnahme:** Benötigte Referenzmaterialien sinnvoll ablegen, temporäre Dateien gezielt ignorieren und ausschließlich nachweislich entbehrliche Artefakte entfernen. Routen, Asset-Verweise und Dokumentationslinks bleiben gültig.

### K30 – Seed-Konfiguration auflösen

**Herkunft:** F27. **Codebezug:** `supabase/config.toml`, konfigurierter Pfad `./seed.sql`.

**Befund:** Der Review vermutet eine referenzierte, fehlende Seed-Datei.

**Korrektur und Abnahme:** Pfadauflösung und tatsächliche Datei prüfen. Falls der Befund bestätigt ist, gültigen Seed bereitstellen oder nicht benötigte Seed-Konfiguration entfernen. Eine frische isolierte lokale Datenbank lässt sich mit dem dokumentierten Setup initialisieren; dafür keine produktive Datenbank zurücksetzen.

## 7. Aufgelöste Unterschiede und ausgeschlossene Fehlalarme

| Thema | Entscheidung für diesen kombinierten Review |
|---|---|
| Webhook F01/F02 gegenüber R02 | K03 bündelt Claim-Wiederaufnahme und Abschlussprüfung; beide Teilprobleme benötigen eigene Abnahme. |
| Conversation-Zuordnung P2/P3 | K11 bleibt P2 wegen der Vertrauensgrenze, aber ausdrücklich bedingt. Keine Behauptung frei erratbarer fremder IDs. |
| Kriterienversion F15 als Hypothese | K12 übernimmt den in R11 statisch beschriebenen Mechanismus. Auswirkungen treten bei Versionswechseln auf; aktuelle Produktivfälle sind nicht nachgewiesen. |
| Root-`.env` | K01 ist dringende Verifikation und Prävention. Fehlende Root-Ignore-Datei beweist weder Tracking noch Exposition. |
| Datenschutz | K10 bündelt Providerinformation, tatsächliche Löschreichweite und Beleg-Retention. Unterschiedliche Fristen allein sind noch kein nachgewiesener Fehler. |
| Eingabegrenzen F21 als P3 | Mit dem verwandten API-Vertragsfehler F20 zu K25/P2 zusammengeführt; keine Hochstufung zu einem belegten Sicherheitsangriff. |
| Lob für Startschutz, Belegprüfung und Release-Gate | Grundsätzlich sinnvolle Mechanismen; die konkreten Gegenbeispiele K02, K04 und K06 schränken das positive Urteil ein. |
| W1: Gesperrter Admin löscht fremde Sessions | Im Copilot-Review durch RLS-/Rollenprüfung widerlegt; kein offener Sicherheitsbefund. Optional explizite Aktivitätsprüfung ergänzen und gewünschtes Verhalten durch Autorisierungstests sichern. Eigene Löschung gesperrter Nutzer nicht versehentlich verbieten. |

## 8. Umsetzung in Arbeitspaketen

Die Reihenfolge berücksichtigt Risiko und Abhängigkeiten. K13 begleitet die Arbeit von Beginn an. P2-Themen mit engem Zusammenhang sollen mit dem jeweiligen P1-Fix umgesetzt werden, statt widersprüchliche Zwischenlösungen zu erzeugen.

| Paket | Inhalt | K-IDs | Voraussetzung / Ergebnis |
|---|---|---|---|
| A – Sofortige Klärung | Secret-Status, aktueller Codebezug, reproduzierbare Fehlerfälle | K01, K13 | Exposition geklärt; je Korrektur bestätigter Ausgangsstand |
| B – Bewertung und Release | Belegnachweis, Stärken, unveränderlicher Release-Snapshot | K04, K06, K14 | Kleine fachliche Regressionen und Release-Nachweis; unabhängig von größerer DB-Änderung umsetzbar |
| C – Session-Lebenszyklus | Zähler, Startfehler, Abbruch, Bind-Retry, Bind-Konflikte und Zuordnung | K02, K05, K07, K11, K16, relevante Teile K19 | Gemeinsames Zustandsmodell und bestätigte Providermechanismen |
| D – Verlässliche Verarbeitung | Receipt-Lease, atomare Writes, vollständige Aggregate, abgesicherte Recovery, Monitoring | K03, K08, K09, K21 | SQL-/Retry-Konzept; isolierte Datenbanktests; Migration und Bestandsdatenbehandlung |
| E – API und Administration | Fehlerbehandlung, Rollenvergabe, letzter Admin, begrenztes Parsing | K17, K18, K19, K25 | Definierte Fehlerverträge und Verhalten bei Teilfehlern |
| F – Daten und Konfiguration | Löschkonzept, Wartungsdaten, Kriterienversionen/-konsistenz, Prompt-Kontext | K10, K12, K15, K20, K22 | Produktentscheidungen zu Retention; Anschluss an C/D und Releaseprozess |
| G – Bedienbarkeit und Härtung | Pagination, Phasenerkennung, CSP, Uploads, Auth-Konfiguration, Repo und Seed | K23, K24, K26–K30 | Zentrale Fehler korrigiert; Hypothesen vor Änderung bestätigt |

**Architekturvorgaben für die Korrekturen:**

- Kein Frameworkwechsel oder zusätzliche Microservices ohne gesondert belegten Bedarf.
- Eine Postgres-Transaktion kann zusammengehörige lokale Daten absichern, aber keine externen Provideroperationen atomar einschließen. Dafür kontrollierte Wiederholung und Kompensation vorsehen.
- Zeitlich begrenzte Claims ohne Schutz vor veralteten Workern reichen nicht aus.
- Ein reiner Upsert behebt weder veraltete parallele Berechnungen noch automatisch obsolete Aggregatzeilen.
- Webhook und Recovery sollen dieselben fachlichen Regeln verwenden.
- Nachträgliche Manipulationserkennung ersetzt keine vorgelagerte Absicherung vertrauenswürdiger Prompt-Steuerung.

## 9. Gemeinsame Abnahme und Freigabegrundlage

Vor breiterem Produktiveinsatz sind mindestens folgende Punkte zu dokumentieren:

- [ ] K01 ist geklärt; eine gegebenenfalls bestätigte Secret-Exposition ist behandelt.
- [ ] K02–K06 sind behoben und anhand ihrer Abnahmekriterien nachgewiesen.
- [ ] Eng gekoppelte Fehler in Start, Bindung und Verarbeitung wurden mitkorrigiert oder ihr verbleibendes Risiko ausdrücklich bewertet.
- [ ] K10 ist fachlich entschieden; Benutzerinformationen und tatsächliche Datenbehandlung stimmen überein.
- [ ] Die für geänderte Abläufe relevanten Handler-, SQL-, RLS- und Regressionstests sind erfolgreich.
- [ ] Notwendige Migrationen und Bestandsdatenkorrekturen wurden in einer isolierten Umgebung geprüft.
- [ ] Webhook-Fehler und verwaiste Verarbeitung werden erkannt; Recovery und Wiederherstellung sind dokumentiert.
- [ ] Ein End-to-End-Nachweis deckt autorisierten Start, Providerverbindung, Bindung, Webhook, Bewertung und Dashboard ab.
- [ ] Ein separater Nachweis deckt Abbruch, erneuten Start und Löschung einschließlich verspäteter Ereignisse ab.
- [ ] Der freizugebende Agentenstand entspricht nachweislich dem getesteten Stand.
- [ ] Verbleibende P2/P3-Themen besitzen Verantwortliche, Zieltermin und bei bewusster Verschiebung eine begründete Entscheidung.

Diese Liste beschreibt künftige Nachweise. Bei Erstellung dieses Dokuments ist kein Punkt als erledigt bestätigt.

## 10. Vollständige Zuordnung zu den Ausgangsreviews

### Codex

| Ausgangsbefund | Kombinierter Befund |
|---|---|
| R01 | K02 |
| R02 | K03 |
| R03 | K04 |
| R04 | K05 |
| R05 | K06 |
| R06 | K07 |
| R07 | K08 |
| R08 | K09 |
| R09 | K10 |
| R10 | K11 |
| R11 | K12 |
| R12 | K13 |
| R13 | K14 |
| Abschnitt C: parallele Verarbeitungslogik | K21 |
| Abschnitt D: Dynamic Variables | K15 |

### GitHub Copilot / Claude

| Ausgangsbefund | Kombinierter Befund |
|---|---|
| F01 | K03 |
| F02 | K03 |
| F03 | K01 |
| F04 | K08 |
| F05 | K07 |
| F06 | K15 |
| F07 | K16 |
| F08 | K17 |
| F09 | K18 |
| F10 | K19 |
| F11 | K09 |
| F12 | K20 |
| F13 | K21 |
| F14 | K22 |
| F15 | K12 |
| F16 | K23 |
| F17 | K13 |
| F18 | K10 |
| F19 | K24 |
| F20 | K25 |
| F21 | K25 |
| F22 | K26 |
| F23 | K27 |
| F24 | K28 |
| F25 | K11 |
| F26 | K29 |
| F27 | K30 |
| W1 | Widerlegt; siehe Abschnitt 7 |
| Abschnitte D/E: Monitoring | K03 und Freigabenachweise |

## 11. Vorlage für die spätere Bearbeitungsdokumentation

Für jede bearbeitete K-ID diesen Datensatz in einem Ticket, PR oder ergänzenden Korrekturprotokoll pflegen:

| Feld | Eintrag |
|---|---|
| K-ID | |
| Status | |
| Verantwortlich | |
| Aktueller Befund bestätigt am / Stand | |
| Reproduktion beziehungsweise Begründung einer Widerlegung | |
| Gewählte Korrektur | |
| Commit / PR / Migration | |
| Geprüfte Abnahmekriterien und Ergebnisse | |
| Bestandsdaten / Deployment / Wiederherstellung | |
| Verbleibende Einschränkungen oder Risikoentscheidung | |
| Abschlussdatum | |

Die beiden Ausgangsreviews bleiben als ursprüngliche Evidenz erhalten. Dieses Dokument dient als gemeinsame Arbeitsgrundlage; abgeschlossene Korrekturen werden durch konkrete Nachweise ergänzt.
