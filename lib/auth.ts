import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, UserContext } from "@/types/domain";

export async function getUserContext(): Promise<UserContext | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const [{ data: profile }, { data: role }] = await Promise.all([
    supabase.from("profiles").select("display_name,is_active").eq("id", user.id).maybeSingle(),
    supabase.from("app_roles").select("role").eq("user_id", user.id).maybeSingle(),
  ]);

  return {
    id: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name || user.email?.split("@")[0] || "Nutzer",
    isActive: profile?.is_active ?? false,
    role: (role?.role as AppRole | undefined) ?? "user",
  };
}

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
