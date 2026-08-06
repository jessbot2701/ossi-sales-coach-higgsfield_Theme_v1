import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { mapInviteAuthError } from "@/lib/admin-invitations";
import { requireApiUser } from "@/lib/auth";
import { getAppUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(["user", "admin"]).default("user"),
});

export async function POST(request: Request) {
  try {
    const admin = await requireApiUser({ admin: true });
    const input = schema.parse(await request.json());
    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(input.email, {
      data: { display_name: input.displayName },
      // Admin invitations use an implicit session in the URL fragment. A server
      // callback cannot read fragments, so the password page restores it client-side.
      redirectTo: `${getAppUrl(request)}/set-password`,
    });
    if (error) throw mapInviteAuthError(error);
    if (!data.user) throw new ApiError(502, "Die Einladung konnte nicht versendet werden.", "invite_failed");
    if (input.role === "admin") {
      await supabase.from("app_roles").upsert({ user_id: data.user.id, role: "admin", granted_by: admin.id, granted_at: new Date().toISOString() });
    }
    return NextResponse.json({ invited: true, userId: data.user.id }, { status: 201 });
  } catch (error) { return apiErrorResponse(error); }
}
