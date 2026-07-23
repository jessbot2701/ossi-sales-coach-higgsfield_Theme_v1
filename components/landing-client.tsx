"use client";

import { useEffect, useState } from "react";

const prompts = [
  "Lass uns ein Kaltakquisegespräch trainieren.",
  "Spiele einen skeptischen SAP-Entscheider.",
  "Wähle selbst ein realistisches Szenario aus.",
  "Rollenspiel beenden und Feedback geben.",
  "Wie hätte ich den Einwand besser behandeln können?",
  "Lass uns den Gesprächseinstieg noch einmal üben.",
];

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
}

export function LandingClient() {
  const [copied, setCopied] = useState("Tipp: Klicke auf einen Satz, um ihn zu kopieren.");
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const hero = document.querySelector<HTMLElement>("[data-hero]");
    const header = document.querySelector<HTMLElement>("[data-header]");
    let ticking = false;

    const updateScrollState = () => {
      ticking = false;
      const scrollY = window.scrollY || window.pageYOffset;
      header?.classList.toggle("is-scrolled", scrollY > 32);
      if (!hero) return;
      const travel = Math.max(1, hero.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, (scrollY - hero.offsetTop) / travel));
      hero.style.setProperty("--hero-progress", progress.toFixed(4));
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateScrollState);
    };

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    root.classList.add("js-ready");
    updateScrollState();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  async function copy(prompt: string) {
    try {
      await copyText(prompt);
      setCopiedPrompt(prompt);
      setCopied("Kopiert – du kannst den Satz im Training direkt verwenden.");
    } catch {
      setCopiedPrompt(null);
      setCopied("Kopieren war nicht möglich. Bitte markiere den Satz manuell.");
    }
  }

  return (
    <>
      <div className="prompt-list" role="list">
        {prompts.map((prompt) => (
          <button
            className={`prompt-chip${copiedPrompt === prompt ? " copied" : ""}`}
            type="button"
            key={prompt}
            onClick={() => copy(prompt)}
          >
            „{prompt}“
          </button>
        ))}
      </div>
      <p className="copy-hint" aria-live="polite">{copied}</p>
    </>
  );
}
