import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("server security boundaries", () => {
  it.each(["app/admin/users/page.tsx", "app/admin/sessions/page.tsx"])(
    "authorizes before creating a privileged client in %s",
    (path) => {
      const page = source(path);
      expect(page.indexOf("requirePageUser({ admin: true })")).toBeGreaterThanOrEqual(0);
      expect(page.indexOf("requirePageUser({ admin: true })")).toBeLessThan(
        page.indexOf("createAdminClient()"),
      );
    },
  );

  it("uses verified claims instead of a remote user lookup for request authorization", () => {
    const auth = source("lib/auth.ts");
    const proxy = source("proxy.ts");
    expect(auth).toContain("auth.getClaims()");
    expect(proxy).toContain("auth.getClaims()");
    expect(auth).not.toContain("auth.getUser()");
    expect(proxy).not.toContain("auth.getUser()");
  });

  it("bounds webhook bodies and stored transcript content", () => {
    const webhook = source("app/api/webhooks/elevenlabs/route.ts");
    expect(webhook).toContain("MAX_WEBHOOK_BODY_BYTES");
    expect(webhook).toContain("readTextBodyWithLimit");
    expect(webhook).toContain("MAX_TRANSCRIPT_TURNS");
    expect(webhook).toContain("MAX_TRANSCRIPT_MESSAGE_CHARS");
  });

  it("does not assign general coaching text to individual competencies", () => {
    const webhook = source("app/api/webhooks/elevenlabs/route.ts");
    expect(webhook).toContain("reasoning: extracted.feedback[slug]");
    expect(webhook).toContain("evidence: extracted.criterionEvidence[slug]");
    expect(webhook).toContain("recommendation: extracted.improvementsByCriterion[slug]");
    expect(webhook).toContain("alternative_formulation: extracted.alternativesByCriterion[slug]");
    expect(webhook).toContain("improvement_evidence: extracted.improvementEvidenceByCriterion[slug]");
    expect(webhook).toContain("improvement_priority: extracted.improvementPriorities[slug]");
    expect(webhook).toContain("strengths: sanitizeSessionStrengths");
    expect(webhook).toContain("next_learning_goal: acceptedLearningGoal");
    expect(webhook).toContain("validateCriterionEvaluations");
    expect(webhook).not.toContain("extracted.feedback[slug] ?? extracted.improvements");
    expect(webhook).not.toContain("extracted.criterionEvidence[slug] ?? extracted.evidence");
  });

  it("applies security headers independently of the hosting provider", () => {
    const config = source("next.config.ts");
    expect(config).toContain("Content-Security-Policy");
    expect(config).toContain("script-src-attr 'none'");
    expect(config).toContain("Strict-Transport-Security");
  });

  it("keeps personal dashboard data scoped while allowing explicit admin session audits", () => {
    const dashboard = source("app/app/page.tsx");
    const training = source("app/app/training/page.tsx");
    const session = source("app/app/sessions/[id]/page.tsx");

    expect(dashboard.match(/\.eq\("user_id", user\.id\)/g)).toHaveLength(4);
    expect(training).toContain("requirePageUser()");
    expect(training).toContain('.eq("user_id", user.id)');
    expect(session).toContain("requirePageUser()");
    expect(session).toContain('if (user.role !== "admin")');
    expect(session).toContain('sessionQuery.eq("user_id", user.id)');
    expect(session).toContain("Administrativer Nur-Lese-Zugriff");
  });

  it("recomputes derived learning data after a session is deleted", () => {
    const route = source("app/api/sessions/[id]/route.ts");
    expect(route).toContain("recomputeLearningProfiles");
    expect(route.indexOf('.delete().eq("id", id)')).toBeLessThan(
      route.indexOf("await recomputeLearningProfiles"),
    );
  });

  it("defers active-user checks on protected pages to the cached page authorization", () => {
    const proxy = source("proxy.ts");
    const auth = source("lib/auth.ts");
    const protectedGuard = proxy.indexOf("if (protectedPath && !isAuthenticated)");
    const profileLookup = proxy.indexOf('.select("is_active")');

    expect(protectedGuard).toBeGreaterThanOrEqual(0);
    expect(profileLookup).toBeGreaterThan(protectedGuard);
    expect(proxy).toContain('select("is_active")');
    expect(auth).toContain('if (!user.isActive) redirect("/login?error=inactive")');
  });

  it("recomputes progress without loading transcripts or issuing per-competency upserts", () => {
    const recompute = source("lib/coaching/recompute.ts");

    expect(recompute).toContain("session:coaching_sessions!inner");
    expect(recompute).not.toContain("transcript");
    expect(recompute).not.toContain("analyzeTranscriptPhases");
    expect(recompute).toContain(".upsert(progressRows");
    expect(recompute).toContain(".upsert(profileRows");
  });

  it("scopes dashboard evidence through an inner session join and explains scores on demand", () => {
    const dashboard = source("app/app/page.tsx");

    expect(dashboard).toContain("session:coaching_sessions!inner");
    expect(dashboard).toContain('.eq("session.user_id", user.id)');
    expect(dashboard).toContain("<details className=\"competency-explanation\">");
    expect(dashboard).toContain("Bewertung verstehen");
    expect(dashboard).toContain("Beobachteter Gesprächsmoment");
  });
});
