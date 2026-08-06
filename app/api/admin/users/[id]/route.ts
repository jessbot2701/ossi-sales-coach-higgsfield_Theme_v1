import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireApiUser({ admin: true });
    const { id } = await params; z.uuid().parse(id);
    const input = z.object({ isActive: z.boolean() }).parse(await request.json());
    if (id === admin.id && !input.isActive) throw new ApiError(400, "Du kannst deinen eigenen Admin-Zugang nicht sperren.", "self_lockout");
    const supabase = createAdminClient();
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
    if (profileError || !profile) throw new ApiError(404, "Nutzer nicht gefunden.", "not_found");

    if (input.isActive) {
      const { error: authError } = await supabase.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (authError) throw new ApiError(500, "Die Auth-Sperre konnte nicht aufgehoben werden.", "auth_unban_failed");
      const { error: updateError } = await supabase.from("profiles").update({ is_active: true }).eq("id", id);
      if (updateError) throw new ApiError(500, "Der Nutzer konnte nicht reaktiviert werden.", "reactivation_failed");
    } else {
      const { error: updateError } = await supabase.from("profiles").update({ is_active: false }).eq("id", id);
      if (updateError) throw new ApiError(500, "Der Nutzer konnte nicht gesperrt werden.", "deactivation_failed");
      const { error: authError } = await supabase.auth.admin.updateUserById(id, { ban_duration: "876000h" });
      if (authError) throw new ApiError(500, "Die Auth-Sperre konnte nicht gesetzt werden.", "auth_ban_failed");
    }
    return NextResponse.json({ updated: true });
  } catch (error) { return apiErrorResponse(error); }
}

const deleteSchema = z.object({
  confirmationEmail: z.email().max(254),
});

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireApiUser({ admin: true });
    const { id } = await params; z.uuid().parse(id);
    if (id === admin.id) throw new ApiError(400, "Du kannst dein eigenes Administratorkonto nicht löschen.", "self_delete");
    const input = deleteSchema.parse(await request.json().catch(() => ({})));

    const supabase = createAdminClient();
    const [
      { data: authData, error: authLookupError },
      { data: profile, error: profileError },
      { data: role, error: roleError },
      { data: adminRoles, error: adminRolesError },
    ] = await Promise.all([
      supabase.auth.admin.getUserById(id),
      supabase.from("profiles").select("id,is_active").eq("id", id).maybeSingle(),
      supabase.from("app_roles").select("role").eq("user_id", id).maybeSingle(),
      supabase.from("app_roles").select("user_id").eq("role", "admin"),
    ]);
    if (authLookupError || !authData.user) throw new ApiError(404, "Nutzer nicht gefunden.", "not_found");
    if (profileError || roleError || adminRolesError) {
      throw new ApiError(500, "Das Nutzerkonto konnte nicht geprüft werden.", "delete_precheck_failed");
    }

    const targetEmail = authData.user.email ?? "";
    if (input.confirmationEmail !== targetEmail) {
      throw new ApiError(400, "Die Bestätigungs-E-Mail stimmt nicht exakt überein.", "confirmation_mismatch");
    }

    if (role?.role === "admin" && profile?.is_active) {
      const adminIds = (adminRoles ?? []).map((item) => item.user_id);
      const { count: activeAdminCount, error: activeAdminError } = adminIds.length
        ? await supabase.from("profiles").select("id", { count: "exact", head: true }).in("id", adminIds).eq("is_active", true)
        : { count: 0, error: null };
      if (activeAdminError) throw new ApiError(500, "Die Administratoren konnten nicht geprüft werden.", "admin_precheck_failed");
      if ((activeAdminCount ?? 0) <= 1) {
        throw new ApiError(409, "Der letzte aktive Administrator kann nicht gelöscht werden.", "last_active_admin");
      }
    }

    const [
      { count: blockingSessionCount, error: sessionError },
      { data: hasStorageObjects, error: storageError },
    ] = await Promise.all([
      supabase.from("coaching_sessions").select("id", { count: "exact", head: true }).eq("user_id", id).in("status", ["created", "active", "processing"]),
      supabase.rpc("user_has_storage_objects", { target_user_id: id }),
    ]);
    if (sessionError || storageError) {
      throw new ApiError(500, "Offene Sitzungen und Dateien konnten nicht geprüft werden.", "delete_precheck_failed");
    }
    if ((blockingSessionCount ?? 0) > 0) {
      throw new ApiError(409, "Der Nutzer hat eine offene oder noch verarbeitete Voice-Session.", "session_in_progress");
    }
    if (hasStorageObjects) {
      throw new ApiError(409, "Zum Nutzer gehören noch gespeicherte Dateien. Lösche oder übertrage sie zuerst.", "storage_objects_exist");
    }

    if (profile) {
      const { error: deactivateError } = await supabase.from("profiles").update({ is_active: false }).eq("id", id);
      if (deactivateError) throw new ApiError(500, "Das Nutzerkonto konnte vor der Löschung nicht gesperrt werden.", "delete_lock_failed");
    }
    const { error: banError } = await supabase.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    if (banError) throw new ApiError(502, "Der Authentifizierungsdienst konnte das Konto nicht sperren.", "auth_provider_error");

    const { count: finalBlockingCount, error: finalSessionError } = await supabase
      .from("coaching_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", id)
      .in("status", ["created", "active", "processing"]);
    if (finalSessionError) throw new ApiError(500, "Der Session-Status konnte vor der Löschung nicht bestätigt werden.", "delete_precheck_failed");
    if ((finalBlockingCount ?? 0) > 0) {
      if (profile?.is_active) {
        await Promise.all([
          supabase.from("profiles").update({ is_active: true }).eq("id", id),
          supabase.auth.admin.updateUserById(id, { ban_duration: "none" }),
        ]);
      }
      throw new ApiError(409, "Während der Löschung wurde eine Voice-Session geöffnet. Das Konto wurde nicht gelöscht.", "session_in_progress");
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(id, false);
    if (deleteError) {
      throw new ApiError(502, "Der Authentifizierungsdienst konnte das Konto nicht endgültig löschen.", "auth_provider_error");
    }
    return NextResponse.json({ deleted: true });
  } catch (error) { return apiErrorResponse(error); }
}
