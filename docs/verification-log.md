# Verification Log

This file records manual verification outcomes for changes made during development.

## Entry Template

- Date:
- Change summary:
- Key files:
- Test on your end:
- Result: PASS/FAIL
- Notes:

## 2026-02-13 15:22:27 PST

- Date: 2026-02-13 15:22:27 PST
- Change summary: Add repo-local confirmation gate + persistent verification log + future-features log entry for Statistical Analysis batch filtering.
- Key files: `AGENTS.md`, `docs/verification-log.md`, `docs/future-features.md`
- Test on your end:
  - Verified `main_2` and newly created `main_3` appear in Summary/Responses/Batch Scope selectors.
  - Ran `node scripts/participant-flow-smoke-test.mjs` and confirmed it prints `DONE: ... passed`.
- Result: PASS
- Notes: The smoke test currently doesn't assert `experiment_responses.submission_status`; you observed at least one completed-looking row with `submission_status='pending'`, which is likely the root of the `main_2` status/count mismatch when using `submission_status='submitted'` as the definition of completion.

## 2026-02-13 16:50:00 PST

- Date: 2026-02-13 16:50:00 PST
- Change summary: Allow editing changelog release status (Committed/Pushed/Deployed) and fix `experiment_settings` upsert RLS for the “Auto mark release on push” toggle.
- Key files: `src/pages/ResearcherChangelog.tsx`, `supabase/migrations/20260214102000_experiment_settings_super_admin_insert_policy.sql`, `supabase/migrations/20260214100000_changelog_entries_release_status.sql`
- Test on your end:
  - Applied `20260214100000_changelog_entries_release_status.sql`, refreshed Changelog page, and used the new dropdown to set v1.1.9 to `Committed`.
  - Applied `20260214102000_experiment_settings_super_admin_insert_policy.sql`, toggled “Auto mark release on push”, and confirmed no RLS error.
- Result: PASS
- Notes: —
