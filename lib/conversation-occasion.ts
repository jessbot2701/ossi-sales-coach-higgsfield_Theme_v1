export const CUSTOM_CONVERSATION_OCCASION_SLUG = "custom_conversation_occasion";
export const MAX_CONVERSATION_OCCASION_LENGTH = 500;

export type ConversationOccasionResolution =
  | { ok: true; value: string }
  | { ok: false; reason: "required" | "too_long" };

export function resolveConversationOccasion({
  scenarioSlug,
  scenarioTitle,
  conversationOccasion,
}: {
  scenarioSlug: string;
  scenarioTitle: string;
  conversationOccasion?: string;
}): ConversationOccasionResolution {
  if (scenarioSlug !== CUSTOM_CONVERSATION_OCCASION_SLUG) {
    return { ok: true, value: scenarioTitle };
  }

  const cleaned = conversationOccasion?.trim() ?? "";
  if (!cleaned) return { ok: false, reason: "required" };
  if (cleaned.length > MAX_CONVERSATION_OCCASION_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  return { ok: true, value: cleaned };
}
