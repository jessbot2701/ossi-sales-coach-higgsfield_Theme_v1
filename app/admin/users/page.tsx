import { AdminUsers, type AdminUserRow } from "@/components/admin-users";
import { PortalHeading } from "@/components/portal-heading";
import { requirePageUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminUsersPage() {
  const admin = await requirePageUser({ admin: true });
  const supabase = createAdminClient();
  const [{ data: authData }, { data: profiles }, { data: roles }] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from("profiles").select("id,display_name,is_active,created_at"),
    supabase.from("app_roles").select("user_id,role"),
  ]);
  const profileMap = new Map((profiles ?? []).map((item) => [item.id, item]));
  const roleMap = new Map((roles ?? []).map((item) => [item.user_id, item.role]));
  const users: AdminUserRow[] = (authData?.users ?? []).map((user) => {
    const profile = profileMap.get(user.id);
    return { id: user.id, email: user.email ?? "", displayName: profile?.display_name || user.email?.split("@")[0] || "Nutzer", isActive: profile?.is_active ?? false, role: roleMap.get(user.id) ?? "user", createdAt: user.created_at };
  });
  return <><PortalHeading eyebrow="Administration" title="Nutzer verwalten" description="Einladungen, Rollen und Zugangssperren. Rollenänderungen erfolgen ausschließlich serverseitig." /><AdminUsers users={users} currentUserId={admin.id} /></>;
}
