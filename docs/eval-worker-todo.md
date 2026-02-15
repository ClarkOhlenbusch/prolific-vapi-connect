# Vapi Eval Worker: TODO / Next Fixes

## Current symptom
- Dashboard buttons enqueue/process without crashing, but **evaluations are not being persisted** (no `vapi_total_score` updates).

## Likely root cause
- `worker-vapi-evaluations` calls the Edge Function `fetch-vapi-structured-output-results` using
  `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`.
- `fetch-vapi-structured-output-results` currently requires a **real user JWT** and calls `supabaseUser.auth.getUser()`.
- The service role key is not a JWT, so the internal call fails (often as "Invalid user session"), meaning:
  - Vapi call data may be fetched by the worker, but results never persist via the fetch function.

## Fix options (pick one)
1. **Preferred**: Move the "fetch Vapi call + persist to experiment_responses" logic into `worker-vapi-evaluations`
   so it doesn't need to call another Edge Function at all.
2. Allow `fetch-vapi-structured-output-results` to accept a worker credential:
   - `x-worker-secret` (env `WORKER_SECRET`) and bypass `auth.getUser()`, or
   - allow service-role Bearer (less ideal: mixes auth mechanisms).

## Additional follow-ups
- Add UI feedback if queue processing ran but updated `0` calls (link to Settings + show active metric id).
- Decide if refresh buttons should target:
  - visible page only (current safe default), or
  - all rows matching filters across pages (needs backend query / pagination-aware approach).
- Implement Vapi structured output definition snapshot (if a stable Vapi endpoint exists) for `vapi_evaluation_metrics.definition`.

