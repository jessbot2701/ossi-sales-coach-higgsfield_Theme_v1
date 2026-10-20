import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser({ active: false });
    const { id } = await params; z.uuid().parse(id);
    const { data, error } = await createAdminClient().rpc("delete_session_consistently", { p_session_id: id, p_actor_id: user.id });
    if (error) throw new ApiError(503, "Die Session konnte nicht konsistent gel?scht werden.", "session_delete_failed");
    if (data === "not_found") throw new ApiError(404, "Session nicht gefunden.", "not_found");
    if (data !== "deleted") throw new ApiError(409, "Bitte beende zuerst die Voice-Verbindung und warte den Abschluss ab.", "session_not_closed");
    return NextResponse.json({ deleted: true });
  } catch (error) { return apiErrorResponse(error); }
}
