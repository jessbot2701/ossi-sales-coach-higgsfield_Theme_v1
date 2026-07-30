"use client";

import { useRouter } from "next/navigation";
import { useAppConversation } from "@/components/app-conversation-provider";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const { endSession, isLocked } = useAppConversation();
  return <button className="plain-button" type="button" data-voice-session-allowed="true" onClick={async () => { if (isLocked) await endSession(); await createClient().auth.signOut(); router.push("/login"); router.refresh(); }}>Abmelden</button>;
}
