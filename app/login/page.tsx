import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { OssiPortrait } from "@/components/ossi-portrait";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="auth-shell">
      <div className="auth-portrait-shell"><OssiPortrait variant="auth" /></div>
      <section className="auth-card">
        <Brand />
        <div className="auth-heading"><p className="eyebrow"><span /> Sicherer Zugang</p><h1>Anmelden</h1><p>Dein persönliches Voice-Coaching ist nur mit einer Admin-Einladung verfügbar.</p></div>
        {params.error === "inactive" && <p className="form-message error">Dein Zugang ist derzeit gesperrt. Bitte wende dich an einen Administrator.</p>}
        <LoginForm next={params.next} />
        <div className="auth-links"><Link href="/">Zur Startseite</Link><span>Keine Selbstregistrierung</span></div>
      </section>
    </main>
  );
}
