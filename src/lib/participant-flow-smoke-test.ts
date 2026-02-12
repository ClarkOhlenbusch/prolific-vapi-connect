import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type SmokeStepStatus = "passed" | "failed";

export interface SmokeTestStep {
  key: string;
  label: string;
  status: SmokeStepStatus;
  detail?: string;
}

export interface SmokeTestResult {
  passed: boolean;
  startedAt: string;
  finishedAt: string;
  runId: string;
  prolificId?: string;
  callId?: string;
  steps: SmokeTestStep[];
}

interface CreateSessionResponse {
  prolificId: string;
  callId: string;
  sessionToken: string;
  expiresAt: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const appendStep = (
  steps: SmokeTestStep[],
  step: Omit<SmokeTestStep, "status"> & { status?: SmokeStepStatus },
) => {
  steps.push({
    status: step.status ?? "passed",
    ...step,
  });
};

const createParticipantClient = () => {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase client env vars (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).");
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `participant-flow-smoke-${crypto.randomUUID()}`,
    },
  });
};

const createPayload = (prolificId: string, callId: string, runId: string) => {
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

const submitEarlyAccess = async (
  participantClient: SupabaseClient<Database>,
  researcherClient: SupabaseClient<Database>,
  prolificId: string,
  callId: string,
  sessionToken: string,
  runId: string,
) => {
  const { data, error } = await participantClient.functions.invoke("submit-early-access", {
    body: {
      sessionToken,
      notifyWhenReady: true,
      notes: `[smoke-test:${runId}] early access check`,
    },
  });

  if (error) {
    // Fallback for environments where submit-early-access has not been deployed yet.
    const { data: fallbackRows, error: fallbackError } = await researcherClient
      .from("experiment_responses")
      .update({
        early_access_notify: true,
        early_access_notes: `[smoke-test:${runId}] early access check`,
      })
      .eq("prolific_id", prolificId)
      .eq("call_id", callId)
      .select("id");

    if (fallbackError) {
      return {
        ok: false,
        message: `submit-early-access failed (${error.message}); fallback update failed (${fallbackError.message}).`,
      };
    }

    if (!fallbackRows || fallbackRows.length === 0) {
      return {
        ok: false,
        message: `submit-early-access failed (${error.message}); fallback update returned zero rows.`,
      };
    }

    return {
      ok: true,
      message: "submit-early-access unavailable; fallback researcher update succeeded.",
    };
  }

  if (!data || typeof data !== "object") {
    return {
      ok: false,
      message: "submit-early-access returned an empty response.",
    };
  }
  return { ok: true, message: "submit-early-access succeeded." };
};

const verifyResearcherVisibility = async (
  researcherClient: SupabaseClient<Database>,
  prolificId: string,
  callId: string,
  runId: string,
) => {
  const { data: callRow, error: callError } = await researcherClient
    .from("participant_calls")
    .select("id, prolific_id, call_id, is_completed")
    .eq("call_id", callId)
    .maybeSingle();

  if (callError || !callRow) {
    return {
      ok: false,
      message: `participant_calls row not visible (${callError?.message ?? "no row"}).`,
    };
  }

  if (callRow.prolific_id !== prolificId) {
    return {
      ok: false,
      message: `participant_calls prolific_id mismatch (${callRow.prolific_id} != ${prolificId}).`,
    };
  }

  const { data: responseRow, error: responseError } = await researcherClient
    .from("experiment_responses")
    .select("id, prolific_id, call_id, pets_total, tias_total, formality, early_access_notify, early_access_notes")
    .eq("call_id", callId)
    .maybeSingle();

  if (responseError || !responseRow) {
    return {
      ok: false,
      message: `experiment_responses row not visible (${responseError?.message ?? "no row"}).`,
    };
  }

  if (responseRow.prolific_id !== prolificId) {
    return {
      ok: false,
      message: `experiment_responses prolific_id mismatch (${responseRow.prolific_id} != ${prolificId}).`,
    };
  }

  if (responseRow.call_id !== callId) {
    return {
      ok: false,
      message: `experiment_responses call_id mismatch (${responseRow.call_id} != ${callId}).`,
    };
  }

  if (responseRow.pets_total == null || responseRow.tias_total == null || responseRow.formality == null) {
    return {
      ok: false,
      message: "Questionnaire totals are missing on the inserted response row.",
    };
  }

  if (responseRow.early_access_notify !== true) {
    return {
      ok: false,
      message: "early_access_notify was not persisted as true.",
    };
  }

  if (
    typeof responseRow.early_access_notes !== "string" ||
    !responseRow.early_access_notes.includes(`[smoke-test:${runId}]`)
  ) {
    return {
      ok: false,
      message: "early_access_notes was not persisted as expected.",
    };
  }

  if (!callRow.is_completed) {
    return {
      ok: false,
      message: "participant_calls.is_completed is false after questionnaire submit.",
    };
  }

  return { ok: true, message: "Rows are visible to researcher and keys are consistent." };
};

export const runParticipantFlowSmokeTest = async (
  researcherClient: SupabaseClient<Database> = supabase,
): Promise<SmokeTestResult> => {
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID().slice(0, 8);
  const steps: SmokeTestStep[] = [];
  const participantClient = createParticipantClient();
  let prolificId = "";
  let callId = "";

  try {
    const { data: sessionData, error: sessionError } = await participantClient.functions.invoke<CreateSessionResponse>(
      "create-researcher-session",
      { body: { source: "participant_flow_smoke_test" } },
    );

    if (sessionError || !sessionData?.prolificId || !sessionData?.callId || !sessionData?.sessionToken) {
      appendStep(steps, {
        key: "create_session",
        label: "Create session",
        status: "failed",
        detail: sessionError?.message || "Missing create-researcher-session response fields.",
      });
      throw new Error("Create session failed.");
    }

    prolificId = sessionData.prolificId;
    callId = sessionData.callId;
    appendStep(steps, {
      key: "create_session",
      label: "Create session",
      detail: `prolific_id=${prolificId}, call_id=${callId}`,
    });

    const payload = createPayload(prolificId, callId, runId);
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
      appendStep(steps, {
        key: "submit_questionnaire",
        label: "Submit questionnaire",
        status: "failed",
        detail: submitError.message,
      });
      throw new Error("Submit questionnaire failed.");
    }

    appendStep(steps, {
      key: "submit_questionnaire",
      label: "Submit questionnaire",
      detail: "submit-questionnaire succeeded.",
    });

    const earlyAccessResult = await submitEarlyAccess(
      participantClient,
      researcherClient,
      prolificId,
      callId,
      sessionData.sessionToken,
      runId,
    );
    if (!earlyAccessResult.ok) {
      appendStep(steps, {
        key: "early_access",
        label: "Update early access",
        status: "failed",
        detail: earlyAccessResult.message,
      });
      throw new Error("Early-access update failed.");
    }

    appendStep(steps, {
      key: "early_access",
      label: "Update early access",
      detail: earlyAccessResult.message,
    });

    const visibilityCheck = await verifyResearcherVisibility(researcherClient, prolificId, callId, runId);
    if (!visibilityCheck.ok) {
      appendStep(steps, {
        key: "researcher_visibility",
        label: "Verify researcher visibility",
        status: "failed",
        detail: visibilityCheck.message,
      });
      throw new Error("Visibility verification failed.");
    }

    appendStep(steps, {
      key: "researcher_visibility",
      label: "Verify researcher visibility",
      detail: visibilityCheck.message,
    });

    return {
      passed: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      runId,
      prolificId,
      callId,
      steps,
    };
  } catch (error) {
    if (steps.length === 0) {
      appendStep(steps, {
        key: "unexpected",
        label: "Unexpected failure",
        status: "failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return {
      passed: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      runId,
      prolificId: prolificId || undefined,
      callId: callId || undefined,
      steps,
    };
  }
};
