import { expect, test, type Page } from "@playwright/test";

async function hideNextDevIndicator(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const indicator = page.locator("nextjs-portal");
  if (await indicator.count()) {
    await expect(indicator).toHaveCSS("display", "none");
  }
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectNoArtificialAuthPageHeight(page: Page) {
  const dimensions = await page.evaluate(() => {
    const contentBottom = Array.from(
      document.querySelectorAll<HTMLElement>(".auth-card, .auth-portrait-shell"),
    ).reduce((bottom, element) => {
      const style = window.getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      const isVisible = style.display !== "none"
        && style.visibility !== "hidden"
        && bounds.width > 0
        && bounds.height > 0;

      return isVisible ? Math.max(bottom, bounds.bottom) : bottom;
    }, 0);

    return {
      allowedHeight: Math.ceil(Math.max(window.innerHeight, contentBottom + 48)),
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    };
  });

  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.allowedHeight);
}

test("preserves the public Ossi visual identity", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await hideNextDevIndicator(page);
  await expect(
    page.getByRole("heading", {
      name: "Meet Ossi. The Prince of Sales Calls.",
    }),
  ).toBeVisible();
  const heroTitleLines = page.locator(".hero-title-line");
  await expect(heroTitleLines).toHaveCount(2);
  await expect(heroTitleLines.nth(0)).toHaveText("The Prince of");
  await expect(heroTitleLines.nth(1)).toHaveText("Sales Calls.");
  const releaseNote = page.getByRole("region", {
    name: "Release 1 · Kaltakquise",
  });
  await expect(releaseNote).toBeVisible();
  await expect(releaseNote).toContainText(
    "Zum Start trainierst du mit Ossi professionelle Kaltakquise und Terminanbahnung. Weitere Gesprächsformate werden schrittweise ergänzt.",
  );
  const portrait = page.getByTestId("ossi-portrait-hero");
  await expect(portrait).toBeVisible();
  await expect(portrait.locator("img")).toHaveAttribute("alt", "Ossi, der AI Sales Coach");
  await expect(page.locator(".hero-session-card")).toHaveCount(1);
  await expect(page.locator('.hero-session-card a[href="/login"]')).toHaveAttribute("href", "/login");
  await expectNoHorizontalPageOverflow(page);
  await page.locator("[data-reveal]").evaluateAll((elements) => elements.forEach((element) => element.classList.add("is-visible")));
  await expect(page.locator("[data-reveal]").first()).toBeVisible();
  await page.addStyleTag({ content: ".hero-video { display: none !important; }" });
  await expect(page).toHaveScreenshot("landing-page.png", { fullPage: true, animations: "disabled" });
  expect(browserErrors).toEqual([]);
});

test("shows invitation-only login and password reset", async ({ page }) => {
  await page.goto("/login");
  await hideNextDevIndicator(page);
  await expect(page.getByTestId("ossi-portrait-auth")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
  await expect(page.getByText("Keine Selbstregistrierung")).toBeVisible();
  await expectNoArtificialAuthPageHeight(page);
  await expect(page).toHaveScreenshot("login-page.png", { animations: "disabled" });
  await page.getByRole("button", { name: "Passwort vergessen?" }).click();
  await expect(page.getByRole("button", { name: "Reset-Link senden" })).toBeVisible();
});

test("shows Ossi while setting a password", async ({ page }) => {
  await page.goto("/set-password");
  await hideNextDevIndicator(page);
  await expect(page.getByTestId("ossi-portrait-auth")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Passwort festlegen" })).toBeVisible();
  await expectNoArtificialAuthPageHeight(page);
  await expect(page).toHaveScreenshot("set-password-page.png", { animations: "disabled" });
});
