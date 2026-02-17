import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const repoRoot = process.cwd();

const parseArgs = (argv) => {
  const out = { baseUrl: "http://localhost:5173", closeAfterMs: 3000 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--base-url") out.baseUrl = String(argv[i + 1] ?? out.baseUrl);
    if (a === "--close-after-ms") out.closeAfterMs = Number(argv[i + 1] ?? out.closeAfterMs);
    if (a === "--no-close") out.closeAfterMs = null;
  }
  return out;
};

const parseDotenv = (raw) => {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
};

const loadLocalEnv = async () => {
  const p = path.join(repoRoot, ".env.playwright.local");
  try {
    const raw = await fs.readFile(p, "utf8");
    return parseDotenv(raw);
  } catch {
    return {};
  }
};

const main = async () => {
  const { baseUrl, closeAfterMs } = parseArgs(process.argv.slice(2));

  const localEnv = await loadLocalEnv();
  const username = process.env.RESEARCHER_USERNAME || localEnv.RESEARCHER_USERNAME || "";
  const password = process.env.RESEARCHER_PASSWORD || localEnv.RESEARCHER_PASSWORD || "";

  if (!username || !password) {
    throw new Error(
      "Missing credentials. Set RESEARCHER_USERNAME / RESEARCHER_PASSWORD or create .env.playwright.local with those keys."
    );
  }

  // Fresh browser each run (no persistent profile) to avoid stale caches.
  // devtools: true is the Playwright equivalent of `playwright-cli show`.
  let browser;
  try {
    browser = await chromium.launch({ headless: false, devtools: true, channel: "chrome" });
  } catch {
    browser = await chromium.launch({ headless: false, devtools: true });
  }
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const researcherUrl = new URL("/researcher", baseUrl).toString();
  const dashboardUrl = new URL("/researcher/dashboard", baseUrl).toString();

  await page.goto(researcherUrl, { waitUntil: "domcontentloaded" });

  // If already logged in, /researcher will usually redirect; handle either path.
  if (page.url().includes("/researcher/dashboard")) {
    // ok
  } else {
    // Ensure we're not in demo.
    const exitDemo = page.getByRole("button", { name: "Exit Demo" });
    if (await exitDemo.count()) await exitDemo.click();

    await page.getByRole("textbox", { name: "Email or Username" }).fill(username);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();
  }

  await page.waitForURL("**/researcher/dashboard", { timeout: 15000 });

  // Lightweight confirmation: header should contain @username (if user metadata is set).
  await page.waitForTimeout(500);
  const handle = await page.locator(`text=@${username}`).first().isVisible().catch(() => false);
  if (!handle) {
    // Don't fail hard: some accounts may not display username; dashboard URL is enough.
    // Still ensure we're on the dashboard.
    if (!page.url().includes("/researcher/dashboard")) {
      throw new Error(`Login did not reach dashboard. Current URL: ${page.url()}`);
    }
  }

  console.log(`OK: logged in and on ${dashboardUrl}`);

  if (closeAfterMs == null) {
    console.log("Browser left open (--no-close). Press Ctrl+C to exit.");
    // Keep process alive.
    // eslint-disable-next-line no-constant-condition
    while (true) await new Promise((r) => setTimeout(r, 60_000));
  } else {
    await page.waitForTimeout(closeAfterMs);
    await context.close();
    await browser.close();
  }
};

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  process.exitCode = 1;
});

