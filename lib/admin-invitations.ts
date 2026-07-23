import type { AuthError } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api";

type InviteAuthError = Pick<AuthError, "code" | "status">;

export function mapInviteAuthError(error: InviteAuthError) {
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return new ApiError(
      429,
      "Das stündliche E-Mail-Limit ist erreicht. Bitte versuche es später erneut.",
      "invite_rate_limited",
    );
  }

  if (error.code === "email_exists" || error.code === "user_already_exists") {
    return new ApiError(409, "Für diese E-Mail-Adresse besteht bereits ein Konto.", "invite_user_exists");
  }

  const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 502;
  return new ApiError(status, "Die Einladung konnte nicht versendet werden.", "invite_failed");
}
