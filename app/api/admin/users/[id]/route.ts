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

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireApiUser({ admin: true });
    const { id } = await params; z.uuid().parse(id);
    if (id === admin.id) throw new ApiError(400, "Du kannst dein eigenes Administratorkonto nicht löschen.", "self_delete");
    const { error } = await createAdminClient().auth.admin.deleteUser(id);
    if (error) throw new ApiError(400, "Das Nutzerkonto konnte nicht gelöscht werden.", "delete_failed");
    return NextResponse.json({ deleted: true });
  } catch (error) { return apiErrorResponse(error); }
}
