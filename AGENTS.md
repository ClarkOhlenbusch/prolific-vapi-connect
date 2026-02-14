# Agent Instructions (Repo Local)

## Manual Verification Steps Required

Whenever you make *any* change to this repository (code, migrations, config, docs, scripts, UI copy, etc.), you must:

- End your response with a **`Test on your end:`** section.
- Provide **1–3 concrete, minimal steps** the user should run to verify the change worked (UI clicks and/or CLI commands).
- Tailor the steps to the specific change (do not reuse generic “run tests” phrasing).
- If no meaningful manual test exists, say so explicitly and explain why.
- Avoid “open/read this file” as a verification step. Prefer runtime checks: UI flows, CLI commands, SQL queries, or observable behavior changes.
- Do not ask the user to verify changes to agent instruction files (like `AGENTS.md`, `docs/verification-log.md`, `docs/future-features.md`) by opening/reading/grepping them. For instruction-file-only changes, state that there is no meaningful manual runtime test and that the effect will be observed in subsequent interactions.

## Confirmation Gate (Required)

After providing `Test on your end:` steps for a change, you must explicitly ask the user to confirm the result before continuing with further changes. Use this exact prompt so the response is easy to parse:

`Can you confirm if it worked? Reply PASS or FAIL (optional: 1 sentence why).`

If the user replies FAIL, do not proceed with additional unrelated work until the failure is understood (ask 1–2 targeted questions or propose a minimal fix).

## Persistent Verification Log

We keep a running log of what was tested and whether it worked at `docs/verification-log.md`.

Rules:
- After the user replies PASS/FAIL, append a new entry to the log with:
  - Date/time (local)
  - Short change summary
  - Key files touched
  - The exact `Test on your end:` steps you gave
  - Result: PASS/FAIL
  - Notes (optional)
- If the user never confirms, do not write a log entry (avoid guessing).

## Future Features / Plans Log

When the user asks to capture future work (feature ideas, TODOs, roadmap items, follow-ups), add an entry to:

`docs/future-features.md`

Keep entries short and actionable (1-3 sentences), and include:
- Problem / user-facing goal
- Proposed UI/behavior
- Key files/areas likely impacted (best effort)
