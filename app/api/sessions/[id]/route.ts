import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { recomputeLearningProfiles } from "@/lib/coaching/recompute";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser({ active: false });
    const { id } = await params; z.uuid().parse(id);
    const supabase = createAdminClient();
    const { data: session } = await supabase
      .from("coaching_sessions")
      .select("id,user_id,version:training_type_versions!inner(training_type_id)")
      .eq("id", id)
      .maybeSingle();
    if (!session || (session.user_id !== user.id && user.role !== "admin")) throw new ApiError(404, "Session nicht gefunden.", "not_found");
    const version = Array.isArray(session.version) ? session.version[0] : session.version;
    if (!version) throw new ApiError(500, "Die Trainingskonfiguration der Session fehlt.", "training_type_missing");
    const { error } = await supabase.from("coaching_sessions").delete().eq("id", id);
    if (error) throw new ApiError(500, "Die Session konnte nicht gelöscht werden.");
    await recomputeLearningProfiles(
      supabase,
      session.user_id,
      version.training_type_id,
      id,
    );
    return NextResponse.json({ deleted: true });
  } catch (error) { return apiErrorResponse(error); }
}
