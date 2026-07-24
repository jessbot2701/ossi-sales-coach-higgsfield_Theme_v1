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

  it("keeps personal portal queries scoped to the signed-in user even for admins", () => {
    const dashboard = source("app/app/page.tsx");
    const training = source("app/app/training/page.tsx");
    const session = source("app/app/sessions/[id]/page.tsx");

    expect(dashboard.match(/\.eq\("user_id", user\.id\)/g)).toHaveLength(4);
    expect(training).toContain("requirePageUser()");
    expect(training).toContain('.eq("user_id", user.id)');
    expect(session).toContain("requirePageUser()");
    expect(session.match(/\.eq\("user_id", user\.id\)/g)).toHaveLength(2);
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
