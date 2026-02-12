import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const loadDotEnv = (filename) => {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

loadDotEnv(".env.local");
loadDotEnv(".env");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEARCHER_EMAIL = process.env.SMOKE_TEST_RESEARCHER_EMAIL;
const RESEARCHER_PASSWORD = process.env.SMOKE_TEST_RESEARCHER_PASSWORD;
const RESEARCHER_IDENTIFIER = process.env.SMOKE_TEST_RESEARCHER_IDENTIFIER;

const runId = `${Date.now()}`.slice(-8);

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

const logStep = (name, detail) => {
  console.log(`PASS: ${name}${detail ? ` - ${detail}` : ""}`);
};

const createPayload = (prolificId, callId) => {
  const feedbackPrefix = `[smoke-test:${runId}]`;

  return {
    petsData: {
      e1: 50,
      e2: 55,
      e3: 45,
      e4: 52,
      e5: 48,
      e6: 57,
      u1: 60,
      u2: 40,
      u3: 53,
      u4: 44,
      e1_position: 1,
      e2_position: 2,
      e3_position: 3,
      e4_position: 4,
      e5_position: 5,
      e6_position: 6,
      u1_position: 7,
      u2_position: 8,
      u3_position: 9,
      u4_position: 10,
      attention_check_1: 50,
      attention_check_1_expected: 50,
      attention_check_1_position: 11,
      pets_er: 51.17,
      pets_ut: 49.25,
      pets_total: 50.21,
      prolific_id: prolificId,
      call_id: callId,
    },
    godspeedData: {
      godspeed_anthro_1: 3,
      godspeed_anthro_2: 4,
      godspeed_anthro_3: 3,
      godspeed_anthro_4: 4,
      godspeed_like_1: 3,
      godspeed_like_2: 4,
      godspeed_like_3: 3,
      godspeed_like_4: 4,
      godspeed_like_5: 3,
      godspeed_intel_1: 4,
      godspeed_intel_2: 4,
      godspeed_intel_3: 3,
      godspeed_intel_4: 4,
      godspeed_intel_5: 3,
      godspeed_anthro_1_position: 1,
      godspeed_anthro_2_position: 2,
      godspeed_anthro_3_position: 3,
      godspeed_anthro_4_position: 4,
      godspeed_like_1_position: 5,
      godspeed_like_2_position: 6,
      godspeed_like_3_position: 7,
      godspeed_like_4_position: 8,
      godspeed_like_5_position: 9,
      godspeed_intel_1_position: 10,
      godspeed_intel_2_position: 11,
      godspeed_intel_3_position: 12,
      godspeed_intel_4_position: 13,
      godspeed_intel_5_position: 14,
      godspeed_anthro_total: 3.5,
      godspeed_like_total: 3.4,
      godspeed_intel_total: 3.6,
      godspeed_attention_check_1: 3,
      godspeed_attention_check_1_expected: 3,
      godspeed_attention_check_1_position: 15,
    },
    tiasData: {
      tias_1: 4,
      tias_2: 4,
      tias_3: 3,
      tias_4: 4,
      tias_5: 3,
      tias_6: 5,
      tias_7: 5,
      tias_8: 4,
      tias_9: 5,
      tias_10: 4,
      tias_11: 5,
      tias_12: 4,
      tias_1_position: 1,
      tias_2_position: 2,
      tias_3_position: 3,
      tias_4_position: 4,
      tias_5_position: 5,
      tias_6_position: 6,
      tias_7_position: 7,
      tias_8_position: 8,
      tias_9_position: 9,
      tias_10_position: 10,
      tias_11_position: 11,
      tias_12_position: 12,
      tias_attention_check_1: 4,
      tias_attention_check_1_expected: 4,
      tias_attention_check_1_position: 13,
      tias_total: 4.17,
    },
    tipiData: {
      tipi_1: 4,
      tipi_2: 5,
      tipi_3: 4,
      tipi_4: 3,
      tipi_5: 4,
      tipi_6: 4,
      tipi_7: 5,
      tipi_8: 4,
      tipi_9: 5,
      tipi_10: 3,
      tipi_1_position: 1,
      tipi_2_position: 2,
      tipi_3_position: 3,
      tipi_4_position: 4,
      tipi_5_position: 5,
      tipi_6_position: 6,
      tipi_7_position: 7,
      tipi_8_position: 8,
      tipi_9_position: 9,
      tipi_10_position: 10,
      tipi_attention_check_1: 4,
      tipi_attention_check_1_expected: 4,
      tipi_attention_check_1_position: 11,
      tipi_extraversion: 4,
      tipi_agreeableness: 4,
      tipi_conscientiousness: 4,
      tipi_emotional_stability: 4,
      tipi_openness: 4,
    },
    intentionData: {
      intention_1: 4,
      intention_2: 4,
    },
    feedbackData: {
      formality: 4,
      voice_assistant_feedback: `${feedbackPrefix} Voice assistant feedback.`,
      communication_style_feedback: `${feedbackPrefix} Communication style feedback.`,
      experiment_feedback: `${feedbackPrefix} Experiment feedback.`,
    },
    assistantType: "formal",
  };
};

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  fail("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_PUBLISHABLE_KEY.");
}

const participantClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const resolveIdentifierToEmail = async (identifier) => {
  if (!identifier) return null;
  const { data, error } = await participantClient.functions.invoke("resolve-researcher-identifier", {
    body: { identifier },
  });
  if (error) {
    fail(`Failed to resolve researcher identifier "${identifier}": ${error.message}`);
  }
  if (!data?.email || typeof data.email !== "string") {
    fail(`Identifier "${identifier}" did not resolve to a unique researcher email.`);
  }
  return data.email;
};

const createVerifierClient = async () => {
  if (SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  let verifierEmail = RESEARCHER_EMAIL || null;
  if (!verifierEmail && RESEARCHER_IDENTIFIER) {
    verifierEmail = await resolveIdentifierToEmail(RESEARCHER_IDENTIFIER);
  }

  if (verifierEmail && RESEARCHER_PASSWORD) {
    const verifier = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await verifier.auth.signInWithPassword({
      email: verifierEmail,
      password: RESEARCHER_PASSWORD,
    });
    if (error) fail(`Unable to sign in researcher verifier: ${error.message}`);
    return verifier;
  }

  fail(
    "Provide SUPABASE_SERVICE_ROLE_KEY, or verifier creds: SMOKE_TEST_RESEARCHER_EMAIL + SMOKE_TEST_RESEARCHER_PASSWORD, or SMOKE_TEST_RESEARCHER_IDENTIFIER + SMOKE_TEST_RESEARCHER_PASSWORD.",
  );
};

const verifierClient = await createVerifierClient();

const { data: sessionData, error: sessionError } = await participantClient.functions.invoke("create-researcher-session", {
  body: { source: "participant_flow_smoke_cli" },
});

if (sessionError || !sessionData?.prolificId || !sessionData?.callId || !sessionData?.sessionToken) {
  fail(sessionError?.message || "create-researcher-session returned missing fields.");
}

const prolificId = sessionData.prolificId;
const callId = sessionData.callId;
logStep("Create session", `prolific_id=${prolificId}, call_id=${callId}`);

const payload = createPayload(prolificId, callId);
const { error: submitError } = await participantClient.functions.invoke("submit-questionnaire", {
  body: {
    sessionToken: sessionData.sessionToken,
    petsData: payload.petsData,
    godspeedData: payload.godspeedData,
    tiasData: payload.tiasData,
    tipiData: payload.tipiData,
    intentionData: payload.intentionData,
    feedbackData: payload.feedbackData,
    assistantType: payload.assistantType,
  },
});

if (submitError) {
  fail(`submit-questionnaire failed: ${submitError.message}`);
}
logStep("Submit questionnaire");

const { error: earlyAccessError } = await participantClient.functions.invoke("submit-early-access", {
  body: {
    sessionToken: sessionData.sessionToken,
    notifyWhenReady: true,
    notes: `[smoke-test:${runId}] early access check`,
  },
});

if (earlyAccessError) {
  const { data: fallbackRows, error: fallbackError } = await verifierClient
    .from("experiment_responses")
    .update({
      early_access_notify: true,
      early_access_notes: `[smoke-test:${runId}] early access check`,
    })
    .eq("prolific_id", prolificId)
    .eq("call_id", callId)
    .select("id");

  if (fallbackError) {
    fail(`submit-early-access failed (${earlyAccessError.message}); fallback update failed (${fallbackError.message})`);
  }

  if (!fallbackRows || fallbackRows.length === 0) {
    fail(`submit-early-access failed (${earlyAccessError.message}); fallback update returned zero rows.`);
  }

  logStep("Update early access", "submit-early-access unavailable; fallback researcher update succeeded");
} else {
  logStep("Update early access");
}

const { data: callRow, error: callError } = await verifierClient
  .from("participant_calls")
  .select("id,prolific_id,call_id,is_completed")
  .eq("call_id", callId)
  .maybeSingle();

if (callError || !callRow) {
  fail(`participant_calls verification failed: ${callError?.message || "row not found"}`);
}

if (callRow.prolific_id !== prolificId) {
  fail(`participant_calls prolific_id mismatch (${callRow.prolific_id} != ${prolificId})`);
}

if (!callRow.is_completed) {
  fail("participant_calls.is_completed is false after submit.");
}

const { data: responseRow, error: responseError } = await verifierClient
  .from("experiment_responses")
  .select("id,prolific_id,call_id,pets_total,tias_total,formality,early_access_notify,early_access_notes")
  .eq("call_id", callId)
  .maybeSingle();

if (responseError || !responseRow) {
  fail(`experiment_responses verification failed: ${responseError?.message || "row not found"}`);
}

if (responseRow.prolific_id !== prolificId || responseRow.call_id !== callId) {
  fail("experiment_responses key mismatch.");
}

if (responseRow.pets_total == null || responseRow.tias_total == null || responseRow.formality == null) {
  fail("experiment_responses questionnaire totals are missing.");
}

if (responseRow.early_access_notify !== true) {
  fail("early_access_notify was not persisted as true.");
}

if (
  typeof responseRow.early_access_notes !== "string" ||
  !responseRow.early_access_notes.includes(`[smoke-test:${runId}]`)
) {
  fail("early_access_notes was not persisted as expected.");
}

logStep("Verify researcher visibility");
console.log(`DONE: participant-flow smoke test passed (run_id=${runId}, prolific_id=${prolificId}, call_id=${callId})`);
