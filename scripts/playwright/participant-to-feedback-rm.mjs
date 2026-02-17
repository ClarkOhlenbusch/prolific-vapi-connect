import process from "node:process";
import { chromium } from "@playwright/test";

const parseArgs = (argv) => {
  const out = { baseUrl: "http://localhost:5173", noClose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--base-url") out.baseUrl = String(argv[i + 1] ?? out.baseUrl);
    if (a === "--no-close") out.noClose = true;
  }
  return out;
};

const main = async () => {
  const { baseUrl, noClose } = parseArgs(process.argv.slice(2));

  // Fresh browser each run (no persistent profile) so cache is always fresh.
  // Use fake media devices/UI so getUserMedia doesn't block the automation run.
  const launchArgs = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
  let browser;
  try {
    browser = await chromium.launch({ headless: false, devtools: true, channel: "chrome", args: launchArgs });
  } catch {
    browser = await chromium.launch({ headless: false, devtools: true, args: launchArgs });
  }
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  await page.goto(new URL("/researcher", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "View as Participant" }).click();

  // The participant entry page auto-focuses the Prolific ID textbox.
  // ResearcherModeToggle deliberately ignores hotkeys while focus is in an editable element,
  // so we must blur before pressing Space+R.
  await page.waitForLoadState("domcontentloaded");
  const prolificInput = page.getByLabel("Prolific ID").first();
  if (await prolificInput.count()) {
    // Click a non-editable area to blur; top-left is safe.
    await page.mouse.click(20, 20);
    await page.waitForTimeout(100);
  }

  // Show ResearcherModeToggle controls: hold Space, then press R.
  await page.keyboard.down("Space");
  await page.waitForTimeout(150);
  await page.keyboard.press("r");
  await page.keyboard.up("Space");

  // Toggle researcher mode ON so the participant page shortcuts appear.
  const modeBtn = page.getByRole("button", { name: /Researcher Mode:/i });
  await modeBtn.click();

  // Use the shortcut panel to navigate to Feedback.
  await page.getByRole("button", { name: "Feedback" }).click();
  await page.waitForURL("**/questionnaire/feedback", { timeout: 15000 });

  // Reproduce the issue: click record and wait 10s, then assert we are still recording.
  const recordBtn = page.getByRole("button", { name: /Click to record/i }).first();
  await recordBtn.click();
  await page.waitForTimeout(10_000);

  const stopVisible = await page.getByRole("button", { name: /^Stop$/i }).isVisible().catch(() => false);
  console.log(`OK: reached /questionnaire/feedback, recordingActiveAfter10s=${stopVisible}`);

  if (noClose) {
    console.log("Browser left open (--no-close). Press Ctrl+C to exit.");
    // eslint-disable-next-line no-constant-condition
    while (true) await new Promise((r) => setTimeout(r, 60_000));
  } else {
    await context.close();
    await browser.close();
  }
};

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  process.exitCode = 1;
});
