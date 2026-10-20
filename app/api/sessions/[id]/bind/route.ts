import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { voiceSessionControl } from "@/lib/coaching/session-lifecycle";

const schema = z.object({ conversationId: z.string().trim().min(8).max(200) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    z.uuid().parse(id);
    const { conversationId } = schema.parse(await request.json());
    const supabase = createAdminClient();
    const result = await voiceSessionControl(supabase, "bind", user.id, id, conversationId);
    if (result?.code === "not_found") throw new ApiError(404, "Session nicht gefunden.", "not_found");
    if (result?.code !== "bound") throw new ApiError(409, "Die Conversation gehört nicht zu dieser offenen Session.", "session_conflict");
    return NextResponse.json({ bound: true, duplicate: result.duplicate === true });
  } catch (error) { return apiErrorResponse(error); }
}
