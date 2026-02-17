import { chromium } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173";
const VIDEO_DIR = process.cwd() + "/playwright-feedback-videos";

const scenarios = [
  {
    id: "01-not-enough-audio",
    name: "Not enough audio (<20s), no text",
    audioMsPerQuestion: 12_000,
    typedText: ["", "", ""],
  },
  {
    id: "02-audio-enough-text-couple",
    name: "Enough audio (~22s), couple of words",
    audioMsPerQuestion: 22_000,
    typedText: [
      "A couple of words.",
      "Need to add a few words.",
      "Just tiny extra notes.",
    ],
  },
  {
    id: "03-audio-enough-and-enough-text",
    name: "Enough audio (~22s) + enough words",
    audioMsPerQuestion: 22_000,
    typedText: [
      "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine thirty thirty-one thirty-two thirty-three thirty-four thirty-five",
      "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine thirty thirty-one thirty-two thirty-three thirty-four thirty-five",
      "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine thirty thirty-one thirty-two thirty-three thirty-four thirty-five",
    ],
  },
];

const REQUIRED_STORAGE_KEYS = {
  petsData: {
    e1: 50, e2: 50, e3: 50, e4: 50, e5: 50, e6: 50,
    u1: 50, u2: 50, u3: 50, u4: 50,
    e1_position: 1, e2_position: 2, e3_position: 3, e4_position: 4, e5_position: 5, e6_position: 6,
    u1_position: 7, u2_position: 8, u3_position: 9, u4_position: 10,
    attention_check_1: 50,
    attention_check_1_expected: 50,
    attention_check_1_position: 11,
    prolific_id: "P-PLAYWRIGHT",
    call_id: "CALL-PLAYWRIGHT",
    pets_er: 50,
    pets_ut: 50,
    pets_total: 50,
  },
  godspeedData: {
    godspeed_anthro_1: 3,
    godspeed_anthro_2: 3,
    godspeed_anthro_3: 3,
    godspeed_anthro_4: 3,
    godspeed_anthro_5: 3,
    godspeed_anthro_6: 3,
    godspeed_anthro_position_1: 1,
    godspeed_anthro_position_2: 2,
    godspeed_anthro_position_3: 3,
    godspeed_anthro_position_4: 4,
    godspeed_anthro_position_5: 5,
    godspeed_anthro_position_6: 6,
  },
  tiasData: {
    "t1": 50,
    "t2": 50,
    "t3": 50,
    "t4": 50,
    "t5": 50,
    "t6": 50,
    "t7": 50,
    "t8": 50,
    "t1_position": 1,
    "t2_position": 2,
    "t3_position": 3,
    "t4_position": 4,
    "t5_position": 5,
    "t6_position": 6,
    "t7_position": 7,
    "t8_position": 8,
    "tias_position": 1,
    "attention_check_1": 50,
    "attention_check_1_expected": 50,
    "attention_check_1_position": 9,
  },
  tipiData: {
    "tipi_1": 50,
    "tipi_2": 50,
    "tipi_3": 50,
    "tipi_4": 50,
    "tipi_5": 50,
    "tipi_6": 50,
    "tipi_position_1": 1,
    "tipi_position_2": 2,
    "tipi_position_3": 3,
    "tipi_position_4": 4,
    "tipi_position_5": 5,
    "tipi_position_6": 6,
  },
  intentionData: { intention: 50, intention2: 50 },
  formalityData: {
    formal: 3,
    casual: 3,
  },
};

const browserLaunchArgs = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makeStoragePayload = {
  prolificId: "P-PLAYWRIGHT",
  callId: "CALL-PLAYWRIGHT",
  sessionToken: "PLAYWRIGHT-SESSION-TOKEN",
};

const setupNetworkStubs = async (context) => {
  await context.route("**/functions/v1/validate-session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ valid: true, participant: { prolificId: makeStoragePayload.prolificId } }),
    });
  });

  await context.route("**/functions/v1/*", async (route) => {
    const url = route.request().url();
    const pathname = new URL(url).pathname;
    let body = { success: true };

    if (pathname.endsWith("/submit-questionnaire")) {
      body = { success: true };
    } else if (pathname.endsWith("/mark-session-complete")) {
      body = { success: true };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await context.route("**/storage/v1/object/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await context.route("**/rest/v1/**", async (route) => {
    const isGet = route.request().method() === "GET";
    await route.fulfill({
      status: isGet ? 200 : 201,
      contentType: "application/json",
      body: JSON.stringify(isGet ? [] : [{}]),
    });
  });
};

const setupBrowserMocks = async (page) => {
  await page.addInitScript(() => {
    const dataKeys = {
      prolificId: "P-PLAYWRIGHT",
      callId: "CALL-PLAYWRIGHT",
      petsData: {
        e1: 50, e2: 50, e3: 50, e4: 50, e5: 50, e6: 50,
        u1: 50, u2: 50, u3: 50, u4: 50,
        e1_position: 1, e2_position: 2, e3_position: 3, e4_position: 4, e5_position: 5, e6_position: 6,
        u1_position: 7, u2_position: 8, u3_position: 9, u4_position: 10,
        attention_check_1: 50,
        attention_check_1_expected: 50,
        attention_check_1_position: 11,
        prolific_id: "P-PLAYWRIGHT",
        call_id: "CALL-PLAYWRIGHT",
        pets_er: 50,
        pets_ut: 50,
        pets_total: 50,
      },
      godspeedData: {
        godspeed_anthro_1: 3,
        godspeed_anthro_2: 3,
        godspeed_anthro_3: 3,
        godspeed_anthro_4: 3,
        godspeed_anthro_5: 3,
        godspeed_anthro_6: 3,
        godspeed_anthro_position_1: 1,
        godspeed_anthro_position_2: 2,
        godspeed_anthro_position_3: 3,
        godspeed_anthro_position_4: 4,
        godspeed_anthro_position_5: 5,
        godspeed_anthro_position_6: 6,
      },
      tiasData: {
        t1: 50,
        t2: 50,
        t3: 50,
        t4: 50,
        t5: 50,
        t6: 50,
        t7: 50,
        t8: 50,
        t1_position: 1,
        t2_position: 2,
        t3_position: 3,
        t4_position: 4,
        t5_position: 5,
        t6_position: 6,
        t7_position: 7,
        t8_position: 8,
        tias_position: 1,
        attention_check_1: 50,
        attention_check_1_expected: 50,
        attention_check_1_position: 9,
      },
      tipiData: {
        tipi_1: 50,
        tipi_2: 50,
        tipi_3: 50,
        tipi_4: 50,
        tipi_5: 50,
        tipi_6: 50,
        tipi_position_1: 1,
        tipi_position_2: 2,
        tipi_position_3: 3,
        tipi_position_4: 4,
        tipi_position_5: 5,
        tipi_position_6: 6,
      },
      intentionData: { intention: 50, intention2: 50 },
      formalityData: { formal: 3, casual: 3 },
    };

    for (const [key, value] of Object.entries(dataKeys)) {
      sessionStorage.setItem(key, JSON.stringify(value));
    }

    sessionStorage.setItem("flowStep", "4");
    sessionStorage.setItem("assistantType", "Cali Playwright");
    localStorage.setItem("sessionToken", "PLAYWRIGHT-SESSION-TOKEN");

    const makeTrack = () => ({ stop: () => {} });
    const fakeStream = {
      getTracks: () => [makeTrack(), makeTrack()],
      getAudioTracks: () => [makeTrack()],
      getVideoTracks: () => [],
    };

    const mediaRecRecorderMap = new Set();
    class FakeMediaRecorder {
      constructor(stream, options = {}) {
        this.stream = stream;
        this.options = options;
        this.mimeType = options.mimeType || "audio/webm";
        this.state = "inactive";
        this.ondataavailable = null;
        this.onstart = null;
        this.onstop = null;
        this.onpause = null;
        this.onerror = null;
        this.onresume = null;
        this.onabort = null;
        this.onend = null;
        this._timer = null;
      }

      start() {
        this.state = "recording";
        if (this.onstart) {
          this.onstart();
        }
        this._timer = setInterval(() => {
          if (typeof this.ondataavailable === "function") {
            const blob = new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType || "audio/webm" });
            this.ondataavailable({ data: blob });
          }
        }, 500);
      }

      stop() {
        if (this.state !== "recording") return;
        this.state = "inactive";
        if (this._timer) {
          clearInterval(this._timer);
          this._timer = null;
        }
        if (typeof this.onstop === "function") {
          this.onstop({});
        }
        if (typeof this.onend === "function") {
          this.onend();
        }
      }

      pause() {
        this.state = "paused";
        if (this._timer) {
          clearInterval(this._timer);
          this._timer = null;
        }
        if (typeof this.onpause === "function") this.onpause({});
      }

      resume() {
        this.state = "recording";
        if (typeof this.onresume === "function") this.onresume({});
      }

      abort() {
        this.state = "inactive";
        if (this._timer) {
          clearInterval(this._timer);
          this._timer = null;
        }
        if (typeof this.onabort === "function") this.onabort({});
        if (typeof this.onend === "function") this.onend();
      }

      requestData() {}
      static isTypeSupported() {
        return true;
      }
    }
    mediaRecRecorderMap.add(FakeMediaRecorder);

    class FakeSpeechRecognition {
      constructor() {
        this.continuous = true;
        this.interimResults = true;
        this.lang = "en-US";
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        this.onstart = null;
      }
      start() {
        if (this.onstart) this.onstart();
        if (this.onend) {
          setTimeout(() => {
            if (this.onend) this.onend();
          }, 6000);
        }
      }
      stop() {
        if (this.onend) this.onend();
      }
      abort() {
        if (this.onend) this.onend();
      }
    }

    if (!window.navigator.mediaDevices) {
      Object.defineProperty(window.navigator, "mediaDevices", {
        value: {},
        configurable: true,
      });
    }
    Object.defineProperty(window.navigator.mediaDevices, "getUserMedia", {
      value: async () => fakeStream,
      configurable: true,
    });
    Object.defineProperty(window, "MediaRecorder", {
      value: FakeMediaRecorder,
      configurable: true,
    });
    Object.defineProperty(window, "SpeechRecognition", {
      value: FakeSpeechRecognition,
      configurable: true,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: FakeSpeechRecognition,
      configurable: true,
    });
  });
};

const fillTextIfNeeded = async (page, questionIndex, value) => {
  if (!value) return;
  const textareas = page.locator("textarea");
  await textareas.nth(questionIndex).scrollIntoViewIfNeeded();
  await textareas.nth(questionIndex).click();
  await textareas.nth(questionIndex).fill(value);
};

const recordQuestion = async (page, index, ms) => {
  const recordButtons = page.locator('[title="Click to record"], [title="Stop recording"]');
  await recordButtons.nth(index).scrollIntoViewIfNeeded();
  await recordButtons.nth(index).click();
  await sleep(ms);
  const stopButton = page.locator('[title="Stop recording"]');
  await stopButton.waitFor({ state: "visible", timeout: 30_000 });
  await stopButton.first().click();
  await sleep(400);
};

const openFeedbackViaResearcherMode = async (page) => {
  await page.goto(new URL("/researcher", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.getByRole("button", { name: "View as Participant" }).click();
  console.log("Reached participant entry page");
  await page.waitForFunction(() => window.location.pathname !== "/researcher", { timeout: 15_000 });
  await page.waitForTimeout(300);

  // The participant entry page auto-focuses Prolific ID input.
  // ResearcherModeToggle ignores hotkeys while an editable has focus,
  // so click outside before pressing Space+R.
  const prolificInput = page.getByLabel("Prolific ID").first();
  if (await prolificInput.count()) {
    await page.mouse.click(20, 20);
    await page.waitForTimeout(100);
    console.log("Clicked outside Prolific ID input before Space+R");
  }

  console.log("Issuing Space+R shortcut for researcher mode");
  await page.keyboard.down("Space");
  await page.waitForTimeout(150);
  await page.keyboard.press("r");
  await page.keyboard.up("Space");
  console.log("Space+R sent");

  const modeButton = page.getByRole("button", { name: /Researcher Mode:/i });
  await modeButton.click();
  console.log("Opened researcher mode controls");

  const feedbackButton = page.getByRole("button", { name: "Feedback" });
  try {
    await feedbackButton.click({ timeout: 5000 });
    console.log("Used Feedback shortcut panel entry");
  } catch {
    console.log("Feedback button was unstable; using direct feedback URL fallback");
    const currentUrl = new URL(page.url());
    const feedbackUrl = new URL("/questionnaire/feedback", BASE_URL);
    const sessionToken = currentUrl.searchParams.get("sessionToken");
    const prolificId = currentUrl.searchParams.get("prolificId");
    if (sessionToken) {
      feedbackUrl.searchParams.set("sessionToken", sessionToken);
    }
    if (prolificId) {
      feedbackUrl.searchParams.set("prolificId", prolificId);
    }
    await page.goto(feedbackUrl.toString(), { timeout: 15_000, waitUntil: "domcontentloaded" });
  }
  await page.waitForURL("**/questionnaire/feedback", { timeout: 15_000 });
};

const expectSubmitOutcome = async (page) => {
  const blocked = page.locator('text=Response Requirement Not Met, Minimum Word Count Required, Submission Recovered, already completed');
  const toasts = [
    page.locator('text="Response Requirement Not Met"'),
    page.locator('text=Minimum Word Count Required'),
    page.locator('text=One more step'),
    page.locator('text=Already Submitted'),
    page.locator('text=Warning'),
  ];

  const submitAttempt = Date.now();
  await page.getByRole("button", { name: "Submit" }).click();

  try {
    await page.waitForURL("**/early-access", { timeout: 70_000 });
    return {
      result: "success",
      message: "Navigated to /early-access",
      durationMs: Date.now() - submitAttempt,
    };
  } catch {
    for (const locator of toasts) {
      const isVisible = await locator.first().isVisible().catch(() => false);
      if (isVisible) {
        return {
          result: "blocked",
          message: await locator.first().textContent(),
          durationMs: Date.now() - submitAttempt,
        };
      }
    }

    const toastText = await page.locator('[role="status"]').first().textContent().catch(() => null);
    return {
      result: "blocked",
      message: toastText || "submit blocked without expected toast",
      durationMs: Date.now() - submitAttempt,
    };
  }
};

const runScenario = async (browser, scenario) => {
  const logs = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1440, height: 950 },
    },
  });

  await setupNetworkStubs(context);
  const page = await context.newPage();

  page.on("console", (msg) => {
    const kind = msg.type();
    if (["log", "error", "warning", "info", "debug"].includes(kind)) {
      logs.push(`[${kind.toUpperCase()}] ${msg.text()}`);
    }
  });

  await openFeedbackViaResearcherMode(page);
  await setupBrowserMocks(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  await page.waitForTimeout(800);

  for (let i = 0; i < 3; i += 1) {
    await fillTextIfNeeded(page, i, scenario.typedText[i]);
    await recordQuestion(page, i, scenario.audioMsPerQuestion);
  }

  const result = await expectSubmitOutcome(page);

  const toastVisible = page.locator('[role="status"]').first();
  const maybeToast = await toastVisible.textContent().catch(() => null);

  const screenshotPath = await page.screenshot({ path: `${VIDEO_DIR}/${scenario.id}.png`, fullPage: true }).catch(() => null);

  await page.waitForTimeout(1000);
  const videoPath = (await page.video()?.path()) || "(unknown)";

  await context.close();

  return {
    scenario: scenario.id,
    name: scenario.name,
    submit: result,
    lastToast: maybeToast,
    screenshotPath,
    videoPath,
    logs,
  };
};

const main = async () => {
  const browser = await chromium.launch({
    headless: false,
    args: browserLaunchArgs,
    channel: "chrome",
  });

  const results = [];
  for (const scenario of scenarios) {
    console.log(`\n=== Running scenario: ${scenario.id} ===`);
    const result = await runScenario(browser, scenario);
    results.push(result);

    console.log(`Scenario ${result.scenario}: ${result.submit.result} (${result.submit.message})`);
    console.log(`Video: ${result.videoPath}`);
    console.log(`Screenshot: ${result.screenshotPath}`);
  }

  await browser.close();

  console.log("\n=== Summary ===");
  for (const result of results) {
    console.log(JSON.stringify(result, null, 2));
  }
};

main().catch((error) => {
  console.error("Playwright feedback script failed:", error);
  process.exitCode = 1;
});
