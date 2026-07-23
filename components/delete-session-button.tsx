"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteSessionButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    if (!window.confirm("Diese Session einschließlich Transkript und Bewertungen vollständig löschen?")) return;
    const response = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (!response.ok) return setError("Die Session konnte nicht gelöscht werden.");
    router.push("/app"); router.refresh();
  }
  return <div><button className="button button-danger" type="button" onClick={remove}>Session löschen</button>{error && <p className="form-message error">{error}</p>}</div>;
}
