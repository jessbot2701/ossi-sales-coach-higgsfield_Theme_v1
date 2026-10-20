import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { reconcilePendingVoiceSession, voiceSessionControl } from "@/lib/coaching/session-lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser({ active: false });
    const { id } = await params;
    z.uuid().parse(id);
    const db = createAdminClient();
    const result = await voiceSessionControl(db, "abort", user.id, id);
    if (result?.code === "not_found") throw new ApiError(404, "Session nicht gefunden.", "not_found");
    if (result?.code === "finished") return NextResponse.json({ aborted: false, finished: true });
    if (result?.code !== "aborted") throw new ApiError(409, "Der Session-Status hat sich geändert.", "session_conflict");
    const released = await reconcilePendingVoiceSession(db, user.id);
    return NextResponse.json({ aborted: true, released }, { status: released ? 200 : 202 });
  } catch (error) { return apiErrorResponse(error); }
}
