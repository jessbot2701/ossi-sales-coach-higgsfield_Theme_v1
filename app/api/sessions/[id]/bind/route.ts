import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ conversationId: z.string().trim().min(8).max(200) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    z.uuid().parse(id);
    const { conversationId } = schema.parse(await request.json());
    const supabase = createAdminClient();
    const { data: session } = await supabase.from("coaching_sessions").select("id,user_id,status,elevenlabs_conversation_id").eq("id", id).maybeSingle();
    if (!session || session.user_id !== user.id) throw new ApiError(404, "Session nicht gefunden.", "not_found");
    if (session.elevenlabs_conversation_id === conversationId) return NextResponse.json({ bound: true, duplicate: true });
    if (session.elevenlabs_conversation_id || session.status !== "created") throw new ApiError(409, "Die Session ist bereits verknüpft.", "already_bound");
    const { error } = await supabase.from("coaching_sessions").update({
      elevenlabs_conversation_id: conversationId, status: "active", started_at: new Date().toISOString(),
    }).eq("id", id).is("elevenlabs_conversation_id", null);
    if (error) throw new ApiError(409, "Die Conversation-ID konnte nicht verknüpft werden.", "bind_failed");
    return NextResponse.json({ bound: true });
  } catch (error) { return apiErrorResponse(error); }
}
