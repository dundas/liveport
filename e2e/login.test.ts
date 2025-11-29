import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3001";
const TEST_USER = {
  email: "testuser@example.com",
  password: "Password123!",
};

// Helper function to login
async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
}

test.describe("LivePort Authentication", () => {
  test("should login with valid credentials and see dashboard", async ({
    page,
  }) => {
    await login(page);

    // Verify dashboard elements using more specific selectors
    await expect(page.locator("h1:has-text('Welcome to LivePort')")).toBeVisible();
    await expect(page.getByText("Active Tunnels", { exact: true })).toBeVisible();
    await expect(page.getByText("Bridge Keys", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Requests Today", { exact: true })).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: "e2e/screenshots/dashboard.png" });
    console.log("✅ Login successful and dashboard loaded!");
  });

  test("should navigate to Bridge Keys page via sidebar", async ({ page }) => {
    await login(page);

    // Click on Bridge Keys in sidebar (use the sidebar link specifically)
    await page.locator("nav").getByText("Bridge Keys").click();
    await page.waitForLoadState("networkidle");

    // Verify we're on the keys page by checking content
    await expect(page.locator("h1:has-text('Bridge Keys')")).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: "e2e/screenshots/bridge-keys-page.png" });
    console.log("✅ Bridge Keys page loaded!");
  });

  test("should navigate to Tunnels page via sidebar", async ({ page }) => {
    await login(page);

    // Click on Tunnels in sidebar
    await page.locator("nav").getByText("Tunnels").click();
    await page.waitForLoadState("networkidle");

    // Verify we're on the tunnels page by checking content
    await expect(page.locator("h1:has-text('Tunnels')")).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: "e2e/screenshots/tunnels-page.png" });
    console.log("✅ Tunnels page loaded!");
  });

  test("should navigate to Settings page via sidebar", async ({ page }) => {
    await login(page);

    // Click on Settings in sidebar
    await page.locator("nav").getByText("Settings").click();
    await page.waitForLoadState("networkidle");

    // Verify we're on the settings page by checking content
    await expect(page.locator("h1:has-text('Settings')")).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: "e2e/screenshots/settings-page.png" });
    console.log("✅ Settings page loaded!");
  });

  test("should click Create Bridge Key and navigate to keys page", async ({ page }) => {
    await login(page);

    // Click Create Bridge Key link (it's a link that navigates to /keys)
    await page.getByRole("link", { name: /create bridge key/i }).click();
    await page.waitForLoadState("networkidle");

    // Verify we're on the keys page
    await expect(page.locator("h1:has-text('Bridge Keys')")).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: "e2e/screenshots/create-key-from-dashboard.png" });
    console.log("✅ Create Bridge Key link works!");
  });

  test("should sign out successfully", async ({ page }) => {
    await login(page);

    // Click sign out
    await page.getByText("Sign out", { exact: true }).click();
    await page.waitForTimeout(1000);

    // Should be redirected to login page
    await expect(page).toHaveURL(/.*login.*/);

    // Take screenshot
    await page.screenshot({ path: "e2e/screenshots/signed-out.png" });
    console.log("✅ Sign out successful!");
  });
});
