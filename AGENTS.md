# Agent Instructions (Repo Local)

## Manual Verification Steps Required

Whenever you make *any* change to this repository (code, migrations, config, docs, scripts, UI copy, etc.), you must:

- If relevant and useful, end your response with a **`Test on your end:`** section.
- Provide **1–3 concrete, minimal steps** the user should run to verify the change worked (UI clicks and/or CLI commands).
- Tailor the steps to the specific change (do not reuse generic “run tests” phrasing).
- Do **not** run `npm run build` (or other slow global checks) by default. Prefer the targeted manual steps above; only run additional checks if the user asks or if it’s needed to debug a failure.
- If the build/version badge is relevant (Researcher Mode or researcher pages), include the **expected badge label** the user should see (e.g. `v1.1.9-uncommitted3`) so they can confirm they’re on the latest local code.
- If no meaningful manual test exists, say so explicitly and explain why.
- Avoid “open/read this file” as a verification step. Prefer runtime checks: UI flows, CLI commands, SQL queries, or observable behavior changes.
- Do not ask the user to verify changes to agent instruction files (like `AGENTS.md`, `docs/verification-log.template.md`, `docs/future-features.md`) by opening/reading/grepping them. For instruction-file-only changes, state that there is no meaningful manual runtime test and that the effect will be observed in subsequent interactions.


### Push Validation Override (Required)

When the user explicitly asks to **push** (or commit+push), run these checks before pushing:

- On push requests, use push skill; must run lint+build before push.
- `npm run lint`
- `npm run build`

If either fails, do not push; report the failure and the first actionable error.
This override is in addition to the always-run lint default above.

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

## Verification Logging (Preferred Workflow)

We keep **local-only** verification notes in `docs/verification-log.local.md` (ignored by git). Use it as a scratchpad while iterating.

## Supabase / Lovable

Supabase schema/migrations and Edge Functions are managed/deployed via **Lovable** in this project. Prefer Lovable's Supabase tooling (e.g. SQL editor / function deploy flows) over ad-hoc local Supabase management when the change is intended for the hosted environment.

### Required Callout: Edge Function Deploy Checklist

Whenever changes touch Supabase Edge Functions, the agent must explicitly list which functions need to be created or redeployed in Lovable.

- If a function's code changes: it must be redeployed.
- If a new folder is added under `supabase/functions/<name>`: it must be created/deployed.
- `src/integrations/supabase/types.ts` changes do not require any Supabase deploy; they only affect frontend type-checking/build.

## Notifications (Local Dev)

When the user has the local notify server + browser tab open, use it to get their attention:

- Done: run `./scripts/notify-browser.sh done`
- Question/blocker: run `./scripts/notify-browser.sh question`
- Before sending any message that asks the user a direct question or reports a blocker, you must trigger the `question` notification first.

If the notify server is not running, fall back to `./scripts/notify.sh done|question`.

Official verification for shipped changes lives on the **Changelog**:
- When a change is pushed/deployed, the PASS/FAIL and steps should be recorded on the relevant changelog change (via `details.verification` in the changelog import JSON and/or editing the entry in the Researcher Changelog UI).

Rules:
- Do not commit/push `docs/verification-log.local.md`.
- Use `docs/verification-log.template.md` as the template for local notes.
- Keep the local dev version badge aligned by reading `docs/working-version.json` (committed).

## Future Features / Plans Log

When the user asks to capture future work (feature ideas, TODOs, roadmap items, follow-ups), add an entry to:

`docs/future-features.md`

Keep entries short and actionable (1-3 sentences), and include:
- Problem / user-facing goal
- Proposed UI/behavior
- Key files/areas likely impacted (best effort)
