import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeading } from "@/components/portal-heading";

export const metadata: Metadata = { title: "So funktioniert’s" };

const competencies = [
  ["Gesprächseröffnung", "Relevanz, Klarheit und ein souveräner Einstieg"],
  ["Fragetechnik", "Offene, zielführende Fragen und echte Bedarfsermittlung"],
  ["Nutzenorientierung", "Ein konkreter, kundenspezifischer Mehrwert"],
  ["Einwandbehandlung", "Zuhören, Einordnen und lösungsorientiertes Reagieren"],
  ["Abschlussstärke", "Ein klarer, verbindlicher nächster Schritt"],
  ["Sprachwirkung", "Ruhige, positive und professionelle Formulierungen"],
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <PortalHeading
        eyebrow="Hilfe & Orientierung"
        title="So funktioniert dein Training."
        description="Ossi simuliert ein realistisches Vertriebsgespräch, wertet deine Aussagen aus und macht deinen Fortschritt über mehrere Sessions sichtbar."
        actions={
          <div className="page-actions">
            <Link className="button button-primary" href="/app/training">
              Training starten
            </Link>
            <Link className="button button-secondary" href="/#about">
              Ossi kennenlernen ↗
            </Link>
          </div>
        }
      />

      <div className="portal-grid training-guide">
        <section
          className="portal-card full release-callout-app"
          aria-labelledby="guide-release-title"
        >
          <h2 id="guide-release-title">Release 1 · Kaltakquise</h2>
          <p>
            Zum Start trainierst du mit Ossi professionelle Kaltakquise und
            Terminanbahnung. Weitere Gesprächsformate werden schrittweise
            ergänzt.
          </p>
        </section>

        <section className="portal-card full guide-flow" aria-labelledby="guide-flow-title">
          <span className="card-label-app">Eine Session in vier Schritten</span>
          <h2 id="guide-flow-title">Vom Szenario zum nächsten Lernziel</h2>
          <ol>
            <li>
              <span>1</span>
              <div>
                <strong>Training wählen</strong>
                <p>Ossi überrascht dich mit einem Szenario oder du wählst gezielt einen Schwerpunkt.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Gespräch führen</strong>
                <p>Du übernimmst den Vertrieb. Ossi spielt zum Beispiel Entscheider, SAP-Leitung oder Zentrale.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Feedback verstehen</strong>
                <p>Nach dem Gespräch erhältst du Bewertungen, Begründungen und konkrete Belege aus deinen Aussagen.</p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Gezielt besser werden</strong>
                <p>Das Dashboard erkennt Entwicklung und schlägt dir ein passendes nächstes Lernziel vor.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="portal-card guide-card" aria-labelledby="guide-capabilities-title">
          <span className="card-label-app">Was Ossi trainiert</span>
          <h2 id="guide-capabilities-title">Sechs Kompetenzfelder</h2>
          <ul className="guide-competencies">
            {competencies.map(([name, description]) => (
              <li key={name}>
                <strong>{name}</strong>
                <span>{description}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="portal-card guide-card" aria-labelledby="guide-rating-title">
          <span className="card-label-app">Bewertungen verstehen</span>
          <h2 id="guide-rating-title">Warum diese Punktzahl?</h2>
          <p>
            Eine Bewertung zählt nur, wenn Ossi eine konkrete Aussage von dir einem Kompetenzfeld
            zuordnen kann. Sehr kurze Sessions können deshalb ohne Bewertung bleiben.
          </p>
          <div className="guide-example">
            <span>Beispiel · Gesprächseröffnung</span>
            <blockquote>
              „Guten Tag Frau Müller, Christian Weiß von IGZ. Wir helfen Logistikleitern, ihre
              SAP-Prozesse stabiler zu betreiben.“
            </blockquote>
            <p>
              <strong>Gut:</strong> Name, Unternehmen, Zielgruppe und ein konkreter Nutzen werden
              direkt verständlich.
            </p>
          </div>
          <p className="guide-note">
            Im Dashboard öffnet „Warum?“ die Begründung und den beobachteten Moment aus dem Gespräch.
          </p>
        </section>

        <section className="portal-card full guide-dashboard" aria-labelledby="guide-dashboard-title">
          <div>
            <span className="card-label-app">Dein Dashboard</span>
            <h2 id="guide-dashboard-title">Beobachtung statt Momentaufnahme</h2>
            <p>
              Durchschnitt, letzte Bewertung und Trend beziehen sich nur auf verwertbare
              Bewertungen. Eine einzelne Session ist ein Hinweis – belastbare Stärken und Trends
              entstehen erst durch mehrere vergleichbare Gespräche.
            </p>
          </div>
          <Link className="button button-secondary" href="/app">
            Zum Dashboard
          </Link>
        </section>
      </div>
    </>
  );
}
