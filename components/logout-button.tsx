"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  return <button className="plain-button" type="button" onClick={async () => { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }}>Abmelden</button>;
}
