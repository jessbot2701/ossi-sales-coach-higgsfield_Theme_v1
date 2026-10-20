import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { resolveConversationOccasion } from "@/lib/conversation-occasion";
import { issueVoiceGrant, reconcilePendingVoiceSession, voiceSessionControl } from "@/lib/coaching/session-lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DynamicVariables } from "@/types/domain";

const schema = z.object({
  trainingTypeId: z.guid(),
  scenarioId: z.guid(),
  mode: z.enum(["surprise", "focus"]),
  focusCriterionId: z.guid().optional(),
  conversationOccasion: z.string().optional(),
  consent: z.literal(true),
  consentVersion: z.string().trim().min(1).max(50),
}).superRefine((value, context) => {
  if (value.mode === "focus" && !value.focusCriterionId) {
    context.addIssue({ code: "custom", path: ["focusCriterionId"], message: "Für gezieltes Training fehlt der Schwerpunkt." });
  }
});

const listText = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 5).join(", ") : "";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const input = schema.parse(await request.json());
    const expectedConsent = process.env.TRANSCRIPT_CONSENT_VERSION?.trim() || "2026-07-18";
    if (input.consentVersion !== expectedConsent) throw new ApiError(400, "Die Einwilligungsversion ist nicht aktuell.", "invalid_consent");
    const supabase = createAdminClient();

    await reconcilePendingVoiceSession(supabase, user.id);

    const [{ data: scenario, error: scenarioError }, { data: versions, error: versionsError }] = await Promise.all([
      supabase.from("scenarios")
        .select("id,slug,title,description,agent_config,is_active,is_user_selectable,training_type_id,training_type:training_types(id,name,is_active)")
        .eq("id", input.scenarioId)
        .eq("training_type_id", input.trainingTypeId)
        .eq("is_user_selectable", true)
        .maybeSingle(),
      supabase.from("training_type_versions")
        .select("id,elevenlabs_agent_id,elevenlabs_branch_id,version_number,is_active")
        .eq("training_type_id", input.trainingTypeId),
    ]);
    if (scenarioError || versionsError) throw new ApiError(503, "Die Trainingskonfiguration konnte nicht gelesen werden.", "training_read_failed");
    const trainingType = Array.isArray(scenario?.training_type) ? scenario?.training_type[0] : scenario?.training_type;
    if (!scenario || !scenario.is_active || !scenario.is_user_selectable || !trainingType?.is_active) throw new ApiError(404, "Das gewählte Szenario ist nicht verfügbar.", "scenario_unavailable");

    const version = versions?.find((item) => item.is_active);
    if (!version) throw new ApiError(409, "Für diese Trainingsart ist keine aktive Agentenversion hinterlegt.", "agent_unavailable");
    const typeVersionIds = (versions ?? []).map((item) => item.id);
    const occasionResolution = resolveConversationOccasion({
      scenarioSlug: scenario.slug,
      scenarioTitle: scenario.title,
      conversationOccasion: input.conversationOccasion,
    });
    if (!occasionResolution.ok) {
      if (occasionResolution.reason === "too_long") {
        throw new ApiError(400, "Der eigene Gesprächsanlass darf maximal 500 Zeichen lang sein.", "conversation_occasion_too_long");
      }
      throw new ApiError(400, "Bitte beschreibe deinen Gesprächsanlass.", "conversation_occasion_required");
    }
    const conversationOccasion = occasionResolution.value;

    const [{ data: learning, error: learningError }, { data: recent, error: recentError },
      { data: profile, error: profileError }, { data: criteria, error: criteriaError }] = await Promise.all([
      supabase.from("learning_profiles").select("training_type_id,strengths,focus_areas,next_learning_goal").eq("user_id", user.id),
      supabase.from("coaching_sessions").select("summary,completed_at").eq("user_id", user.id).eq("status", "completed")
        .in("training_type_version_id", typeVersionIds).not("summary", "is", null)
        .order("completed_at", { ascending: false }).limit(3),
      supabase.from("profiles").select("display_name").eq("id", user.id).single(),
      supabase.from("evaluation_criteria").select("id,name,sort_order").eq("training_type_id", input.trainingTypeId).eq("is_active", true).order("sort_order"),
    ]);
    if (learningError || recentError || profileError || criteriaError) throw new ApiError(503, "Die Trainingsdaten konnten nicht gelesen werden.", "training_context_read_failed");
    if (!criteria?.length) throw new ApiError(409, "Für diese Trainingsart sind keine Schwerpunkte konfiguriert.", "criteria_unavailable");
    const selectedCriterion = input.mode === "focus" ? criteria.find((criterion) => criterion.id === input.focusCriterionId) : null;
    if (input.mode === "focus" && !selectedCriterion) throw new ApiError(400, "Der gewählte Trainingsschwerpunkt ist nicht verfügbar.", "invalid_focus");
    const globalProfile = (learning ?? []).find((item) => item.training_type_id === null);
    const typeProfile = (learning ?? []).find((item) => item.training_type_id === input.trainingTypeId);
    const recentSummaries = (recent ?? []).map((item) => item.summary).join(" | ");
    const scenarioConfig = scenario.agent_config && typeof scenario.agent_config === "object" && !Array.isArray(scenario.agent_config)
      ? scenario.agent_config as Record<string, unknown>
      : {};
    const contextQuestions = typeof scenarioConfig.context_questions === "string"
      ? scenarioConfig.context_questions.slice(0, 2_000)
      : "Erfrage vor der Bereitschaftsfrage den konkreten Gesprächskontext.";
    const roleplaySetup = typeof scenarioConfig.roleplay_setup === "string"
      ? scenarioConfig.roleplay_setup.slice(0, 2_000)
      : "Wähle eine zum Gesprächsanlass passende realistische Kundensituation.";

    const dynamicVariables: DynamicVariables = {
      user_first_name: (profile?.display_name || user.displayName).trim().split(/\s+/)[0],
      training_type: trainingType.name,
      scenario: scenario.title,
      conversation_occasion: conversationOccasion,
      context_collection_instruction: `${contextQuestions} ${roleplaySetup}`,
      global_strengths: listText(globalProfile?.strengths),
      global_focus_areas: listText(globalProfile?.focus_areas),
      training_strengths: listText(typeProfile?.strengths),
      training_focus_areas: listText(typeProfile?.focus_areas),
      recent_session_summaries: recentSummaries,
      current_learning_goal: typeProfile?.next_learning_goal || globalProfile?.next_learning_goal || "Gespräch strukturiert und lösungsorientiert führen",
      session_mode: input.mode === "focus" ? "Gezieltes Training" : "Überraschungsmodus",
      session_focus: selectedCriterion?.name || "Freie, wechselnde Auswahl aus allen Trainingsschwerpunkten unter Berücksichtigung von Lernprofil und Abwechslung",
      available_training_focuses: criteria.map((criterion) => criterion.name).join(", "),
    };

    const { data: reservation, error: reserveError } = await supabase.rpc("reserve_voice_session", {
      p_user_id: user.id,
      p_version_id: version.id,
      p_scenario_id: scenario.id,
      p_consent_version: input.consentVersion,
      p_snapshot: {
        id: scenario.id, title: scenario.title, description: scenario.description,
        agentConfig: scenario.agent_config, trainingType: trainingType.name, agentVersion: version.version_number,
        conversationOccasion,
        mode: input.mode, focusCriterionId: selectedCriterion?.id ?? null, focusCriterionName: selectedCriterion?.name ?? null,
      },
    });
    if (reserveError || !reservation) throw new ApiError(503, "Die Session konnte nicht vorbereitet werden.", "session_reserve_failed");
    if (reservation.code === "session_rate_limited") throw new ApiError(429, "Das stündliche Session-Limit ist erreicht.", reservation.code);
    if (reservation.code === "session_already_open") throw new ApiError(409, "Die bisherige Voice-Verbindung ist noch nicht sicher beendet. Bitte lege auf und versuche es danach erneut.", reservation.code);
    if (reservation.code !== "reserved" || typeof reservation.session_id !== "string") throw new ApiError(409, "Die Session kann derzeit nicht gestartet werden.", "session_reserve_conflict");

    const sessionId = reservation.session_id;
    try {
      const grant = await issueVoiceGrant(version.elevenlabs_agent_id, version.elevenlabs_branch_id);
      const issued = await voiceSessionControl(supabase, "issue", user.id, sessionId, grant.conversationId);
      if (issued?.code !== "issued") throw new ApiError(409, "Die Session-Vorbereitung ist nicht mehr gültig.", "session_conflict");
      return NextResponse.json({ sessionId, signedUrl: grant.signedUrl, dynamicVariables });
    } catch (error) {
      // This transition only closes an unissued preparation, never an active grant.
      await voiceSessionControl(supabase, "fail_preparation", user.id, sessionId);
      throw error;
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
