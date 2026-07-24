import { cache } from "react";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, UserContext } from "@/types/domain";

export const getUserContext = cache(async (): Promise<UserContext | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = claims?.sub;
  if (error || !userId) return null;
  const email = typeof claims.email === "string" ? claims.email : "";

  const [{ data: profile }, { data: role }] = await Promise.all([
    supabase.from("profiles").select("display_name,is_active").eq("id", userId).maybeSingle(),
    supabase.from("app_roles").select("role").eq("user_id", userId).maybeSingle(),
  ]);

  return {
    id: userId,
    email,
    displayName: profile?.display_name || email.split("@")[0] || "Nutzer",
    isActive: profile?.is_active ?? false,
    role: (role?.role as AppRole | undefined) ?? "user",
  };
});

export async function requireApiUser(options: { admin?: boolean; active?: boolean } = {}) {
  const user = await getUserContext();
  if (!user) throw new ApiError(401, "Bitte melde dich an.", "unauthorized");
  if (options.active !== false && !user.isActive) {
    throw new ApiError(403, "Dein Zugang ist derzeit gesperrt.", "user_inactive");
  }
  if (options.admin && user.role !== "admin") {
    throw new ApiError(403, "Für diese Aktion fehlen Administratorrechte.", "forbidden");
  }
  return user;
}

export async function requirePageUser(options: { admin?: boolean } = {}) {
  const user = await getUserContext();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/login?error=inactive");
  if (options.admin && user.role !== "admin") redirect("/app");
  return user;
}
