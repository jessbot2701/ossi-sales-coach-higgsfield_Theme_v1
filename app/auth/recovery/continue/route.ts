import { NextResponse } from "next/server";
import { getAppUrl, getPublicSupabaseEnv } from "@/lib/env";
import { isRecoveryToken } from "@/lib/supabase/recovery-link";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = form.get("token");

  if (!isRecoveryToken(token)) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", request.url), 303);
  }

  const { url: supabaseUrl } = getPublicSupabaseEnv();
  const verifyUrl = new URL("/auth/v1/verify", supabaseUrl);
  verifyUrl.searchParams.set("token", token);
  verifyUrl.searchParams.set("type", "recovery");
  verifyUrl.searchParams.set("redirect_to", `${getAppUrl(request)}/set-password`);

  return NextResponse.redirect(verifyUrl, 303);
}
