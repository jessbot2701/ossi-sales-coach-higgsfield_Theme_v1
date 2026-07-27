import Link from "next/link";
import { Brand } from "@/components/brand";
import { IntroSound } from "@/components/intro-sound";
import { LandingClient } from "@/components/landing-client";
import { OssiPortrait } from "@/components/ossi-portrait";
import { getUserContext } from "@/lib/auth";

const evaluationCriteria = [
  "Gesprächseröffnung",
  "Fragetechnik und Bedarfsermittlung",
  "Nutzenargumentation",
  "Einwandbehandlung",
  "Abschluss und Terminsteuerung",
  "Sprachwirkung und Lösungsorientierung",
] as const;

const scenarioExamples = [
  "Offener Entscheider",
  "Skeptischer SAP-Leiter",
  "Zentrale unter Zeitdruck",
] as const;

export default async function LandingPage() {
  const user = await getUserContext();
  const hasPortalAccess = Boolean(user?.isActive);

  return (
    <>
      <div className="site-grain" aria-hidden="true" />
      <IntroSound />
      <a className="skip-link" href="#main">Zum Inhalt springen</a>

      <header className="site-header" data-header>
        <Brand />
        <nav aria-label="Hauptnavigation">
          <a href="#how">So funktioniert&apos;s</a>
          <a href="#about">Über Ossi</a>
          <Link className="nav-cta" href={hasPortalAccess ? "/app" : "/login"}>
            {hasPortalAccess ? "Zum Dashboard" : "Anmelden"}
          </Link>
        </nav>
      </header>

      <main id="main">
        <section className="hero" id="top" data-hero aria-labelledby="hero-title">
          <div className="hero-sticky">
            <div className="hero-image-stage" aria-hidden="true">
              <div className="hero-image-scroll">
                <OssiPortrait variant="hero" />
                <video
                  className="hero-video"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  poster="/assets/hero-final.webp"
                  disablePictureInPicture
                >
                  <source
                    src="/assets/ossi-hero-mobile.mp4"
                    type="video/mp4"
                    media="(max-width: 760px)"
                  />
                  <source src="/assets/ossi-hero.mp4" type="video/mp4" />
                </video>
              </div>
              <div className="hero-vignette" />
            </div>

            <svg className="hero-wave" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
              <path d="M-80 520 C140 420 260 640 480 520 S820 400 1020 515 S1320 620 1680 470" />
              <path d="M-80 545 C140 445 260 665 480 545 S820 425 1020 540 S1320 645 1680 495" />
              <path d="M-80 570 C140 470 260 690 480 570 S820 450 1020 565 S1320 670 1680 520" />
              <path d="M-80 595 C140 495 260 715 480 595 S820 475 1020 590 S1320 695 1680 545" />
            </svg>

            <div className="hero-copy">
              <p className="eyebrow reveal-item">KI-gestütztes Vertriebstraining</p>
              <h1
                id="hero-title"
                className="reveal-item"
                aria-label="Meet Ossi. The Prince of Sales Calls."
              >
                Meet Ossi.<br />
                <em>
                  <span className="hero-title-line">The Prince of</span>
                  <span className="hero-title-line">Sales Calls.</span>
                </em>
              </h1>
              <p className="hero-intro reveal-item">
                Dein persönlicher KI-Vertriebscoach für professionelle
                B2B-Vertriebsgespräche im SAP-Umfeld.
              </p>
              <p className="hero-detail reveal-item">
                Trainiere Gesprächseinstieg, Bedarfsermittlung,
                Nutzenargumentation, Einwandbehandlung und Abschluss in
                realistischen Voice-Sessions – mit nachvollziehbarem Feedback
                und messbarem Fortschritt.
              </p>
              <div className="hero-actions reveal-item">
                <Link className="button button-primary" href="/app/training">
                  <span className="mic-icon" aria-hidden="true" />
                  Training starten
                </Link>
                <a className="text-link" href="#how">
                  So funktioniert das Training <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>

            <aside className="hero-session-card" aria-label="Voice-Session-Status">
              <div className="hero-session-topline">
                <span>Voice Session</span>
                <span className="session-ready"><i /> Bereit</span>
              </div>
              <strong>Dein Training.<br />Dein Fortschritt.</strong>
              <p>
                Sessions sind nur nach Anmeldung und aktiver Zustimmung zur
                zwölfmonatigen Transkriptspeicherung verfügbar.
              </p>
              <Link href={hasPortalAccess ? "/app" : "/login"}>
                {hasPortalAccess ? "Zum Dashboard" : "Sicher anmelden"} <span aria-hidden="true">↗</span>
              </Link>
            </aside>

            <p className="hero-side-note" aria-hidden="true">SIGNAL / STRUKTUR / WIRKUNG</p>
            <div className="scroll-cue" aria-hidden="true"><span>Scroll</span><i /></div>
          </div>
        </section>

        <section className="release-note" aria-labelledby="release-note-title">
          <div className="section-shell release-note-inner" data-reveal>
            <h2 id="release-note-title">
              Release 1 <span>· Kaltakquise</span>
            </h2>
            <p>
              Zum Start trainierst du mit Ossi professionelle Kaltakquise und
              Terminanbahnung. Weitere Gesprächsformate werden schrittweise
              ergänzt.
            </p>
          </div>
        </section>

        <section className="how-section" id="how" aria-labelledby="how-title">
          <header className="section-shell cases-header">
            <p className="section-kicker" data-reveal>Dein Training</p>
            <div>
              <h2 id="how-title" data-reveal>So trainierst du<br />mit Ossi.</h2>
              <p className="section-lead" data-reveal>
                Du spielst den IGZ-Vertrieb. Ossi übernimmt deinen
                Gesprächspartner und gibt dir anschließend konkretes,
                personalisiertes Feedback.
              </p>
            </div>
          </header>

          <div className="training-steps">
            <article className="case training-step">
              <div className="case-index" aria-hidden="true">01</div>
              <div className="case-body">
                <p className="case-label">Vorbereiten</p>
                <h3>Szenario<br />bestimmen.</h3>
                <p>
                  Wähle eine konkrete Gesprächssituation – oder lass dich
                  standardmäßig von Ossi überraschen.
                </p>
                <div className="case-examples">
                  <p>Beispiele:</p>
                  <ul aria-label="Beispielszenarien">
                    {scenarioExamples.map((scenario) => <li key={scenario}>{scenario}</li>)}
                  </ul>
                </div>
              </div>
              <div className="case-signal" aria-hidden="true"><i /><i /><i /></div>
            </article>

            <article className="case case-two training-step">
              <div className="case-index" aria-hidden="true">02</div>
              <div className="case-body">
                <p className="case-label">Trainieren</p>
                <h3>Gespräch<br />führen.</h3>
                <p>
                  Führe das Telefonat wie in der Praxis: Bedarf ermitteln,
                  Nutzen vermitteln und zum nächsten Schritt führen.
                </p>
              </div>
              <blockquote>
                <span aria-hidden="true">“</span>
                Nicht ablesen.<br />Echt reagieren.
              </blockquote>
            </article>

            <article className="case training-step">
              <div className="case-index" aria-hidden="true">03</div>
              <div className="case-body">
                <p className="case-label">Auswerten</p>
                <h3>Gezielt<br />verbessern.</h3>
                <p>
                  Erhalte Bewertungen in sechs klaren Kompetenzfeldern,
                  konkrete Belegstellen und einen nächsten Lernfokus.
                </p>
              </div>
              <div className="case-line" aria-hidden="true"><span /></div>
            </article>
          </div>

          <div
            className="section-shell evaluation-panel"
            data-reveal
            aria-labelledby="evaluation-title"
          >
            <div className="prompt-heading evaluation-heading">
              <div>
                <p className="section-kicker">Sechs Bewertungskriterien</p>
                <h3 id="evaluation-title">Darauf achtet Ossi.</h3>
              </div>
              <p>1–5 Punkte · nur wenn beobachtbar</p>
            </div>
            <ol className="evaluation-list">
              {evaluationCriteria.map((criterion, index) => (
                <li key={criterion}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  {criterion}
                </li>
              ))}
            </ol>
          </div>

          <div className="section-shell prompt-panel" data-reveal>
            <div className="prompt-heading">
              <div>
                <p className="section-kicker">Direkt loslegen</p>
                <h3>Das kannst du zu Ossi sagen.</h3>
              </div>
              <p>Ein Satz genügt.</p>
            </div>
            <LandingClient />
          </div>
        </section>

        <section className="about-section" id="about" aria-labelledby="about-title">
          <div className="method section-shell">
            <div className="method-heading">
              <p className="section-kicker" data-reveal>Dein Coach</p>
              <h2 id="about-title" data-reveal>
                Sales Calls<br /><span>mit Wirkung.</span>
              </h2>
            </div>
            <div className="about-copy">
              <p data-reveal>
                Ossi simuliert anspruchsvolle Gesprächspartner und reagiert
                dynamisch auf deine Gesprächsführung. Keine automatischen
                Zustimmungen, keine langen KI-Monologe – sondern kurze,
                authentische Telefongespräche.
              </p>
              <p data-reveal>
                Dein persönliches Lernprofil entwickelt sich mit jeder Session
                weiter, ohne vollständige alte Transkripte in neue Gespräche zu
                übertragen.
              </p>
              <blockquote data-reveal>
                „Lösung schlägt Argument. Stelle gute Fragen, mache den Nutzen
                greifbar und führe konsequent zum nächsten Schritt.“
              </blockquote>
              <div className="coach-points" data-reveal>
                <span>Gesprächseröffnung</span>
                <span>Nutzenargumentation</span>
                <span>Einwandbehandlung</span>
                <span>Terminsteuerung</span>
              </div>
            </div>
          </div>
        </section>

        <section className="final-cta section-shell" aria-labelledby="final-title">
          <div>
            <p className="section-kicker" data-reveal>Bereit für den nächsten Anruf?</p>
            <h2 id="final-title" data-reveal>Rock your next<br /><span>SAP sales call.</span></h2>
          </div>
          <Link className="button button-primary" href="/app/training">
            <span className="mic-icon" aria-hidden="true" />
            Training starten
          </Link>
        </section>

        <section className="privacy-note" aria-label="Hinweis zur Sprachverarbeitung">
          <div className="section-shell privacy-inner">
            <strong>Hinweis zur Nutzung</strong>
            <p>
              Dieses Training verwendet einen KI-gestützten Voice Agent. Vor
              jeder Session ist eine aktive Einwilligung erforderlich. Bitte
              keine vertraulichen Kunden-, Personen- oder Projektdaten verwenden.
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <Brand />
        <p>Voice-Coaching für den IGZ-Vertrieb · Version 2.0</p>
        <nav aria-label="Rechtliche Links">
          <a href="https://www.igz.com" target="_blank" rel="noreferrer">IGZ</a>
          <a href="https://www.igz.com/impressum/" target="_blank" rel="noreferrer">Impressum</a>
          <a href="https://www.igz.com/datenschutz/" target="_blank" rel="noreferrer">Datenschutz</a>
        </nav>
      </footer>
    </>
  );
}
