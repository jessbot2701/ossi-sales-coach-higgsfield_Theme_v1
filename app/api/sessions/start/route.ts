import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { requireServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DynamicVariables } from "@/types/domain";

const schema = z.object({
  trainingTypeId: z.guid(),
  mode: z.enum(["surprise", "focus"]),
  focusCriterionId: z.guid().optional(),
  consent: z.literal(true),
  consentVersion: z.string().trim().min(1).max(50),
}).superRefine((value, context) => {
  if (value.mode === "focus" && !value.focusCriterionId) {
    context.addIssue({ code: "custom", path: ["focusCriterionId"], message: "Für gezieltes Training fehlt der Schwerpunkt." });
  }
});

const listText = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 5).join(", ") : "";
const SESSION_START_LIMIT_PER_HOUR = 10;
const CREATED_SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVE_SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const input = schema.parse(await request.json());
    const expectedConsent = process.env.TRANSCRIPT_CONSENT_VERSION?.trim() || "2026-07-18";
    if (input.consentVersion !== expectedConsent) throw new ApiError(400, "Die Einwilligungsversion ist nicht aktuell.", "invalid_consent");
    const supabase = createAdminClient();

    const now = Date.now();
    const [{ error: staleCreatedError }, { error: staleActiveError }] = await Promise.all([
      supabase.from("coaching_sessions").update({
        status: "failed", processing_error: "Session wurde nicht innerhalb von 15 Minuten gestartet.",
      }).eq("user_id", user.id).eq("status", "created").lt("created_at", new Date(now - CREATED_SESSION_TIMEOUT_MS).toISOString()),
      supabase.from("coaching_sessions").update({
        status: "failed", processing_error: "Aktive Session hat das Zeitlimit überschritten.",
      }).eq("user_id", user.id).eq("status", "active").lt("created_at", new Date(now - ACTIVE_SESSION_TIMEOUT_MS).toISOString()),
    ]);
    if (staleCreatedError || staleActiveError) throw new ApiError(500, "Der Session-Status konnte nicht geprüft werden.", "session_state_check_failed");

    const hourlyWindowStart = new Date(now - 60 * 60 * 1000).toISOString();
    const [{ data: openSession, error: openSessionError }, { count: recentStartCount, error: rateLimitError }] = await Promise.all([
      supabase.from("coaching_sessions").select("id").eq("user_id", user.id).in("status", ["created", "active"]).limit(1).maybeSingle(),
      supabase.from("coaching_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", hourlyWindowStart),
    ]);
    if (openSessionError || rateLimitError) throw new ApiError(500, "Das Session-Limit konnte nicht geprüft werden.", "session_limit_check_failed");
    if (openSession) throw new ApiError(409, "Es ist bereits eine Voice-Session geöffnet.", "session_already_open");
    if ((recentStartCount ?? 0) >= SESSION_START_LIMIT_PER_HOUR) {
      throw new ApiError(429, "Das stündliche Session-Limit ist erreicht. Bitte versuche es später erneut.", "session_rate_limited");
    }

    const [{ data: scenario }, { data: versions }] = await Promise.all([
      supabase.from("scenarios")
        .select("id,title,description,agent_config,is_active,training_type_id,training_type:training_types(id,name,is_active)")
        .eq("slug", "coach_surprise").eq("training_type_id", input.trainingTypeId).maybeSingle(),
      supabase.from("training_type_versions")
        .select("id,elevenlabs_agent_id,elevenlabs_branch_id,version_number,is_active")
        .eq("training_type_id", input.trainingTypeId),
    ]);
    const trainingType = Array.isArray(scenario?.training_type) ? scenario?.training_type[0] : scenario?.training_type;
    if (!scenario || !scenario.is_active || !trainingType?.is_active) throw new ApiError(404, "Das gewählte Szenario ist nicht verfügbar.", "scenario_unavailable");

    const version = versions?.find((item) => item.is_active);
    if (!version) throw new ApiError(409, "Für diese Trainingsart ist keine aktive Agentenversion hinterlegt.", "agent_unavailable");
    const typeVersionIds = (versions ?? []).map((item) => item.id);

    const [{ data: learning }, { data: recent }, { data: profile }, { data: criteria, error: criteriaError }] = await Promise.all([
      supabase.from("learning_profiles").select("training_type_id,strengths,focus_areas,next_learning_goal").eq("user_id", user.id),
      supabase.from("coaching_sessions").select("summary,completed_at").eq("user_id", user.id).eq("status", "completed")
        .in("training_type_version_id", typeVersionIds).not("summary", "is", null)
        .order("completed_at", { ascending: false }).limit(3),
      supabase.from("profiles").select("display_name").eq("id", user.id).single(),
      supabase.from("evaluation_criteria").select("id,name,sort_order").eq("training_type_id", input.trainingTypeId).eq("is_active", true).order("sort_order"),
    ]);
    if (criteriaError || !criteria?.length) throw new ApiError(409, "Für diese Trainingsart sind keine Schwerpunkte konfiguriert.", "criteria_unavailable");
    const selectedCriterion = input.mode === "focus" ? criteria.find((criterion) => criterion.id === input.focusCriterionId) : null;
    if (input.mode === "focus" && !selectedCriterion) throw new ApiError(400, "Der gewählte Trainingsschwerpunkt ist nicht verfügbar.", "invalid_focus");
    const globalProfile = (learning ?? []).find((item) => item.training_type_id === null);
    const typeProfile = (learning ?? []).find((item) => item.training_type_id === input.trainingTypeId);
    const recentSummaries = (recent ?? []).map((item) => item.summary).join(" | ");

    const dynamicVariables: DynamicVariables = {
      user_first_name: (profile?.display_name || user.displayName).trim().split(/\s+/)[0],
      training_type: trainingType.name,
      scenario: scenario.title,
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

    const { data: session, error: insertError } = await supabase.from("coaching_sessions").insert({
      user_id: user.id,
      training_type_version_id: version.id,
      scenario_id: scenario.id,
      status: "created",
      consent_version: input.consentVersion,
      consented_at: new Date().toISOString(),
      scenario_snapshot: {
        id: scenario.id, title: scenario.title, description: scenario.description,
        agentConfig: scenario.agent_config, trainingType: trainingType.name, agentVersion: version.version_number,
        mode: input.mode, focusCriterionId: selectedCriterion?.id ?? null, focusCriterionName: selectedCriterion?.name ?? null,
      },
    }).select("id").single();
    if (insertError?.code === "23505") throw new ApiError(409, "Es ist bereits eine Voice-Session geöffnet.", "session_already_open");
    if (insertError || !session) throw new ApiError(500, "Die Session konnte nicht vorbereitet werden.");

    const query = new URLSearchParams({ agent_id: version.elevenlabs_agent_id });
    if (version.elevenlabs_branch_id) query.set("branch_id", version.elevenlabs_branch_id);
    const signedResponse = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?${query}`, {
      headers: { "xi-api-key": requireServerEnv("ELEVENLABS_API_KEY") }, cache: "no-store",
    });
    if (!signedResponse.ok) {
      await supabase.from("coaching_sessions").update({ status: "failed", processing_error: `Signed URL request failed (${signedResponse.status})` }).eq("id", session.id);
      throw new ApiError(502, "Der Voice Agent ist vorübergehend nicht erreichbar.", "voice_provider_error");
    }
    const signed = z.object({ signed_url: z.url() }).parse(await signedResponse.json());
    return NextResponse.json({ sessionId: session.id, signedUrl: signed.signed_url, dynamicVariables });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
