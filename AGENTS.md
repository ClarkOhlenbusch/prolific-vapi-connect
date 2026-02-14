# Agent Instructions (Repo Local)

## Manual Verification Steps Required

Whenever you make *any* change to this repository (code, migrations, config, docs, scripts, UI copy, etc.), you must:

- End your response with a **`Test on your end:`** section.
- Provide **1–3 concrete, minimal steps** the user should run to verify the change worked (UI clicks and/or CLI commands).
- Tailor the steps to the specific change (do not reuse generic “run tests” phrasing).
- Do **not** run `npm run build` (or other slow global checks) by default. Prefer the targeted manual steps above; only run additional checks if the user asks or if it’s needed to debug a failure.
- If the build/version badge is relevant (Researcher Mode or researcher pages), include the **expected badge label** the user should see (e.g. `v1.1.9-uncommitted3`) so they can confirm they’re on the latest local code.
- If no meaningful manual test exists, say so explicitly and explain why.
- Avoid “open/read this file” as a verification step. Prefer runtime checks: UI flows, CLI commands, SQL queries, or observable behavior changes.
- Do not ask the user to verify changes to agent instruction files (like `AGENTS.md`, `docs/verification-log.md`, `docs/future-features.md`) by opening/reading/grepping them. For instruction-file-only changes, state that there is no meaningful manual runtime test and that the effect will be observed in subsequent interactions.

## Confirmation Gate (Required)

After providing `Test on your end:` steps for a change, you must explicitly ask the user to confirm the result before continuing with further changes. Use this exact prompt so the response is easy to parse:

`Can you confirm if it worked? Reply PASS or FAIL (optional: 1 sentence why).`

If the user replies FAIL, do not proceed with additional unrelated work until the failure is understood (ask 1–2 targeted questions or propose a minimal fix).

## Plan-First For Big Changes (Required)

When a request is a "big change" (likely to require explanation, tradeoffs, or multi-step rollout), do not immediately implement it. Instead:

- Write a short, decision-complete plan first (goal, scope, steps, risks, rollback, and 1-3 acceptance tests).
- Ask the user to confirm the plan before making repo changes.

Treat a change as "big" if any are true:
- It affects production data (SQL backfills, migrations, RLS/policies, cleanup jobs).
- It touches Edge Functions / Supabase functions or auth/permissions.
- It changes the meaning of core statuses/analytics (e.g., completion semantics).
- It spans 3+ files or multiple layers (DB + function + UI).

Note: we cannot literally switch the system "mode" from here, but we can enforce the same behavior: plan first, then implement after user confirmation.

## Persistent Verification Log

We keep a running log of what was tested and whether it worked at `docs/verification-log.md`.

Rules:
- Keep a single header line near the top: `Current Working Version: vX.Y.Z` (this is the local source-of-truth for the in-app version badge during development).
- Keep a single header line near the top: `Current Working Patch: N` (Codex increments this when making changes so the in-app badge becomes `vX.Y.Z-uncommittedN` and survives hard refreshes).
- After the user replies PASS/FAIL, append a new entry to the log with:
  - Date/time (local)
  - Short change summary
  - Key files touched
  - Related changelog reference(s):
    - Changelog version (if known)
    - Related changelog import JSON filename (preferred when available)
    - Related commit hash(es) (short OK)
  - The exact `Test on your end:` steps you gave
  - Result: PASS/FAIL
  - Notes (optional)
- If the user never confirms, do not write a log entry (avoid guessing).

## Changelog + Verification Linking (Required)

This does **not** conflict with using `docs/verification-log.md` for local, uncommitted work:
- If the change is **not committed yet**, you may log the PASS/FAIL in `docs/verification-log.md` with `Commit(s): (uncommitted)` and omit the changelog import JSON link for now.
- Once the change **has a commit hash**, the linking below becomes required (either by updating the original verification entry, or by adding a short follow-up entry that references the commit + changelog import).

When you append (or backfill) a PASS/FAIL entry to `docs/verification-log.md` for a change that has a known commit hash, you must also do one of:

- Create a new `docs/changelog-import-*.json` entry that includes `details.verification` for that change, or
- Update the existing changelog import JSON that contains that change to add `details.verification`.

And the verification-log entry must include a "Related changelog import" field pointing at that JSON filename so we can click from verification to changelog quickly.

## Future Features / Plans Log

When the user asks to capture future work (feature ideas, TODOs, roadmap items, follow-ups), add an entry to:

`docs/future-features.md`

Keep entries short and actionable (1-3 sentences), and include:
- Problem / user-facing goal
- Proposed UI/behavior
- Key files/areas likely impacted (best effort)
