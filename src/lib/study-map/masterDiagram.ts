export const MASTER_STUDY_MAP_MERMAID = `
flowchart LR
  MASTER["Master System Design"]

  subgraph JOURNEY["1) Participant Journey"]
    P_ID["Prolific ID<br/>/"]
    P_CONSENT["Consent<br/>/consent"]
    P_DEMO["Demographics<br/>/demographics"]
    P_VAF["Voice Assistant Familiarity<br/>/voiceassistant-familiarity"]
    P_PRACTICE["Practice Conversation<br/>/practice"]
    P_CALL["Voice Conversation<br/>/voice-conversation"]
    P_Q_PETS["PETS Questionnaire<br/>/questionnaire/pets"]
    P_Q_GODSPEED["Godspeed Questionnaire<br/>/questionnaire/godspeed"]
    P_Q_TIAS["TIAS Questionnaire<br/>/questionnaire/tias"]
    P_Q_INTENTION["Intention Questionnaire<br/>/questionnaire/intention"]
    P_Q_TIPI["TIPI Questionnaire<br/>/questionnaire/tipi"]
    P_Q_FORMALITY["Formality Questionnaire<br/>/questionnaire/formality"]
    P_Q_FEEDBACK["Feedback Questionnaire<br/>/questionnaire/feedback"]
    P_EA["Early Access<br/>/early-access"]

    P_ID --> P_CONSENT --> P_DEMO --> P_VAF --> P_PRACTICE --> P_CALL
    P_CALL --> P_Q_PETS --> P_Q_GODSPEED --> P_Q_TIAS --> P_Q_INTENTION --> P_Q_TIPI --> P_Q_FORMALITY --> P_Q_FEEDBACK --> P_EA
  end

  subgraph LIFECYCLE["2) Persistence & Lifecycle"]
    L_PC_CREATE["SAVE: participant_calls row created"]
    L_DEMO_SAVE["SAVE: demographics insert/update"]
    L_CONFIG["get-experiment-config"]
    L_VALIDATE["validate-session"]
    L_INIT["initiate-vapi-call"]
    L_WEBHOOK["vapi-webhook"]
    L_UPDATE["update-call-id"]
    L_SUBMIT["submit-questionnaire"]
    L_ER_SAVE["SAVE: experiment_responses insert/update"]
    L_COMPLETE["COMPLETE: participant_calls.is_completed = true"]
    L_COMPLETE_FN["mark-session-complete (fallback)"]

    L_PC_CREATE --> L_VALIDATE --> L_INIT --> L_WEBHOOK --> L_UPDATE --> L_SUBMIT --> L_ER_SAVE --> L_COMPLETE
    L_COMPLETE_FN --> L_COMPLETE
  end

  subgraph ARCH["3) System Architecture"]
    A_REACT["React SPA"]
    A_SUPABASE["Supabase (DB + Auth + Functions)"]
    A_EDGE["Edge Functions (Deno)"]
    A_VAPI["Vapi Voice Platform"]

    A_REACT --> A_EDGE --> A_SUPABASE
    A_EDGE --> A_VAPI
    A_VAPI --> A_EDGE
  end

  subgraph DATA["4) Data Model"]
    D_PARTICIPANT["participant_calls"]
    D_RESPONSES["experiment_responses"]
    D_DEMOGRAPHICS["demographics"]
    D_NAV["navigation_events"]
    D_SETTINGS["experiment_settings"]
    D_BATCHES["experiment_batches"]
    D_ROLES["researcher_roles"]

    D_PARTICIPANT --> D_RESPONSES
    D_DEMOGRAPHICS --> D_RESPONSES
    D_SETTINGS --> D_BATCHES
  end

  subgraph DASH["5) Researcher Surfaces"]
    R_LOGIN["Researcher Login<br/>/researcher"]
    R_DASH["Dashboard<br/>/researcher/dashboard"]
    R_STATS["Statistical Analysis<br/>/researcher/statistics"]
    R_USERS["User Management<br/>/researcher/users"]
    R_CHANGELOG["Changelog<br/>/researcher/changelog"]

    R_LOGIN --> R_DASH --> R_STATS
    R_DASH --> R_USERS
    R_DASH --> R_CHANGELOG
  end

  MASTER --> P_ID
  MASTER --> L_PC_CREATE
  MASTER --> A_REACT
  MASTER --> D_PARTICIPANT
  MASTER --> R_LOGIN

  P_ID --> L_PC_CREATE
  P_DEMO --> L_DEMO_SAVE
  P_VAF --> L_DEMO_SAVE
  P_PRACTICE --> L_CONFIG
  P_CALL --> L_INIT
  P_CALL --> L_UPDATE
  P_Q_FEEDBACK --> L_SUBMIT

  L_PC_CREATE --> D_PARTICIPANT
  L_DEMO_SAVE --> D_DEMOGRAPHICS
  L_VALIDATE --> D_PARTICIPANT
  L_UPDATE --> D_PARTICIPANT
  L_ER_SAVE --> D_RESPONSES
  L_COMPLETE --> D_PARTICIPANT
  P_CALL --> D_NAV

  R_LOGIN --> D_ROLES
  R_DASH --> D_RESPONSES
  R_DASH --> D_NAV
  R_DASH --> D_SETTINGS

  click P_ID "/"
  click P_CONSENT "/consent"
  click P_DEMO "/demographics"
  click P_VAF "/voiceassistant-familiarity"
  click P_PRACTICE "/practice"
  click P_CALL "/voice-conversation"
  click P_Q_PETS "/questionnaire/pets"
  click P_Q_GODSPEED "/questionnaire/godspeed"
  click P_Q_TIAS "/questionnaire/tias"
  click P_Q_INTENTION "/questionnaire/intention"
  click P_Q_TIPI "/questionnaire/tipi"
  click P_Q_FORMALITY "/questionnaire/formality"
  click P_Q_FEEDBACK "/questionnaire/feedback"
  click P_EA "/early-access"
  click R_LOGIN "/researcher"
  click R_DASH "/researcher/dashboard"
  click R_STATS "/researcher/statistics"
  click R_USERS "/researcher/users"
  click R_CHANGELOG "/researcher/changelog"
`;

export const STUDY_MAP_GROUP_LABELS = {
  UNGROUPED: "Master",
  JOURNEY: "Participant Journey",
  LIFECYCLE: "Persistence & Lifecycle",
  ARCH: "Architecture",
  DATA: "Data Model",
  DASH: "Researcher Surfaces",
} as const;

export type StudyMapFocus = "all" | "journey" | "lifecycle" | "architecture" | "data" | "dashboard";

export const NODE_DETAILS: Record<string, string> = {
  MASTER: "Top-level map that links participant flow, backend lifecycle, architecture, data entities, and researcher analysis surfaces.",
  L_PC_CREATE: "participant_calls row is created at session start (Prolific ID submit, or researcher session bootstrap).",
  L_DEMO_SAVE: "Demographics table is first inserted, then updated with voice-assistant familiarity answers.",
  L_CONFIG: "Assigns condition and assistant IDs for practice/main conversation setup.",
  L_VALIDATE: "Validates active session tokens before protected participant steps.",
  L_INIT: "Checks session/token and permits starting a Vapi call.",
  L_WEBHOOK: "Receives signed Vapi webhook events and processes call updates.",
  L_UPDATE: "Links Vapi call ID back into participant_calls.call_id.",
  L_SUBMIT: "Validates full payload and persists final questionnaire output.",
  L_ER_SAVE: "Creates experiment_responses row for participants; updates existing row for researcher replay sessions.",
  L_COMPLETE: "Marks participant_calls.is_completed = true after successful final submission.",
  L_COMPLETE_FN: "Client-side fallback edge function used to force completion state when needed.",
  D_PARTICIPANT: "Tracks session lifecycle status, call linkage, and completion status.",
  D_RESPONSES: "Consolidated questionnaire and study output table for analysis.",
  D_NAV: "Page navigation and time-on-page tracking events.",
  R_DASH: "Main researcher workspace for responses, summaries, timing, prompts, settings, and review workflows.",
};
