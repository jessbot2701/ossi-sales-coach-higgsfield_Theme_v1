import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium, devices } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const baseUrl = (process.env.PERF_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const budgets = {
  ttfbMs: 500,
  fcpMs: 1_800,
  lcpMs: 2_500,
  cls: 0.1,
  loadMs: 3_000,
  maxLongTaskMs: 200,
};
const cases = [
  { name: "landing-desktop", path: "/", device: devices["Desktop Chrome"] },
  { name: "landing-mobile", path: "/", device: devices["Pixel 7"] },
  { name: "login-desktop", path: "/login", device: devices["Desktop Chrome"] },
  { name: "login-mobile", path: "/login", device: devices["Pixel 7"] },
];
if (supabaseUrl && secretKey) {
  cases.push(
    { name: "dashboard-desktop", path: "/app", device: devices["Desktop Chrome"], authenticated: true },
    { name: "dashboard-mobile", path: "/app", device: devices["Pixel 7"], authenticated: true },
  );
}

const admin = supabaseUrl && secretKey
  ? createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  : null;
const temporaryEmail = `codex-performance-${randomUUID()}@example.com`;
const temporaryPassword = `Ossi-Performance-${randomUUID()}!`;
let temporaryUserId;
let browser;
const results = [];

try {
  if (admin) {
    const { data, error } = await admin.auth.admin.createUser({
      email: temporaryEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { display_name: "Codex Performance User" },
    });
    if (error || !data.user) throw error ?? new Error("Temporärer Performance-Nutzer fehlt.");
    temporaryUserId = data.user.id;
  }
  browser = await chromium.launch({ headless: true });
  for (const testCase of cases) {
    const context = await browser.newContext(testCase.device);
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__performanceSmoke = { cls: 0, lcpMs: 0, longTaskMs: 0, maxLongTaskMs: 0 };
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const latest = entries.at(-1);
        if (latest) window.__performanceSmoke.lcpMs = latest.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__performanceSmoke.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__performanceSmoke.longTaskMs += entry.duration;
          window.__performanceSmoke.maxLongTaskMs = Math.max(
            window.__performanceSmoke.maxLongTaskMs,
            entry.duration,
          );
        }
      }).observe({ type: "longtask", buffered: true });
    });

    if (testCase.authenticated) {
      await page.goto(`${baseUrl}/login`);
      await page.getByLabel("E-Mail-Adresse").fill(temporaryEmail);
      await page.getByLabel("Passwort").fill(temporaryPassword);
      await page.getByRole("button", { name: "Anmelden" }).click();
      await page.waitForURL((url) => url.pathname === "/app");
    }
    const response = await page.goto(`${baseUrl}${testCase.path}`, { waitUntil: "load" });
    await page.waitForTimeout(1_500);
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const paint = performance.getEntriesByType("paint");
      const fcp = paint.find((entry) => entry.name === "first-contentful-paint");
      const resources = performance.getEntriesByType("resource");
      return {
        httpStatus: performance.getEntriesByType("navigation").length ? 200 : null,
        ttfbMs: navigation?.responseStart ?? null,
        fcpMs: fcp?.startTime ?? null,
        lcpMs: window.__performanceSmoke.lcpMs || null,
        cls: window.__performanceSmoke.cls,
        loadMs: navigation?.loadEventEnd ?? null,
        longTaskMs: window.__performanceSmoke.longTaskMs,
        maxLongTaskMs: window.__performanceSmoke.maxLongTaskMs,
        transferBytes: resources.reduce((total, entry) => total + (entry.transferSize || 0), 0),
        resourceCount: resources.length,
      };
    });
    metrics.httpStatus = response?.status() ?? metrics.httpStatus;

    const failures = [];
    for (const [metric, limit] of Object.entries(budgets)) {
      const value = metrics[metric];
      if (typeof value !== "number" || value > limit) {
        failures.push({ metric, value, limit });
      }
    }
    results.push({
      name: testCase.name,
      path: testCase.path,
      metrics,
      failures,
      status: failures.length ? "FAIL" : "PASS",
    });
    await context.close();
  }
} finally {
  await browser?.close();
  if (admin && temporaryUserId) {
    const { error } = await admin.auth.admin.deleteUser(temporaryUserId);
    if (error) throw error;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  budgets,
  totals: {
    total: results.length,
    passed: results.filter((result) => result.status === "PASS").length,
    failed: results.filter((result) => result.status === "FAIL").length,
  },
  results,
};
const reportDirectory = new URL("../artifacts/test-results/", import.meta.url);
await mkdir(reportDirectory, { recursive: true });
const reportUrl = new URL("performance-smoke-latest.json", reportDirectory);
await writeFile(reportUrl, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (report.totals.failed) process.exitCode = 1;
