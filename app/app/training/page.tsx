import { TrainingLauncher } from "@/components/training-launcher";
import { PortalHeading } from "@/components/portal-heading";
import { requirePageUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  const [params, user] = await Promise.all([searchParams, requirePageUser()]);
  const initialMode = params.mode === "focus" ? "focus" : "surprise";
  const supabase = await createClient();
  const [{ data: trainingTypes }, { data: scenarios }, { data: criteria }, { data: learningProfiles }] = await Promise.all([
    supabase.from("training_types").select("id,name,description").eq("is_active", true).order("name"),
    supabase.from("scenarios").select("id,training_type_id,slug,title,description,sort_order").eq("is_active", true).eq("is_user_selectable", true).order("sort_order"),
    supabase.from("evaluation_criteria").select("id,training_type_id,name,description,sort_order,competency:competencies(name)").eq("is_active", true).order("sort_order"),
    supabase.from("learning_profiles").select("training_type_id,focus_areas,next_learning_goal").eq("user_id", user.id),
  ]);
  return <><PortalHeading eyebrow="Neue Session" title="Wie möchtest du heute trainieren?" description="Wähle zuerst Trainingsart und Gesprächsanlass. Anschließend kannst du Ossi überraschen lassen oder gezielt einen Schwerpunkt trainieren." />{trainingTypes?.length && scenarios?.length && criteria?.length ? <TrainingLauncher trainingTypes={trainingTypes as never} scenarios={scenarios as never} criteria={criteria as never} learningProfiles={(learningProfiles ?? []) as never} consentVersion={process.env.TRANSCRIPT_CONSENT_VERSION || "2026-07-18"} initialMode={initialMode} /> : <div className="empty-state">Derzeit ist keine aktive Trainingskonfiguration verfügbar.</div>}</>;
}
