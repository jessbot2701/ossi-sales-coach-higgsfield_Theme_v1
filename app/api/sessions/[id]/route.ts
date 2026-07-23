import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser({ active: false });
    const { id } = await params; z.uuid().parse(id);
    const supabase = createAdminClient();
    const { data: session } = await supabase.from("coaching_sessions").select("id,user_id").eq("id", id).maybeSingle();
    if (!session || (session.user_id !== user.id && user.role !== "admin")) throw new ApiError(404, "Session nicht gefunden.", "not_found");
    const { error } = await supabase.from("coaching_sessions").delete().eq("id", id);
    if (error) throw new ApiError(500, "Die Session konnte nicht gelöscht werden.");
    return NextResponse.json({ deleted: true });
  } catch (error) { return apiErrorResponse(error); }
}
