# Verification Log

This file records manual verification outcomes for changes made during development.

Current Working Version: v1.1.9
Current Working Patch: 8

## Entry Template

- Date:
- Change summary:
- Key files:
- Related changelog:
  - Version:
  - Import JSON:
  - Commit(s):
- Test on your end:
- Result: PASS/FAIL
- Notes:

## 2026-02-13 19:16:57 PST

- Date: 2026-02-13 19:16:57 PST
- Change summary: Fix dictation mic permission denied UX (toast first attempt, modal on repeat) and prevent accidental rapid double-taps; ensure Feedback page no longer blanks due to callback ordering.
- Key files: `src/pages/FeedbackQuestionnaire.tsx`, `src/components/VoiceDictation.tsx`, `src/components/researcher/ParticipantJourneyModal.tsx`, `src/components/BuildVersionBadge.tsx`, `vite.config.ts`, `AGENTS.md`
- Related changelog:
  - Version: v1.1.9
  - Import JSON: `docs/changelog-import-2026-02-14-1.1.9-3.json`
  - Commit(s): `38eb680`, `f7de6ac`
- Test on your end:
  - Enable Researcher Mode and refresh; confirm the badge shows `v1.1.9-uncommitted6`.
  - Block mic permission and go to `/questionnaire/feedback`: click `Click to record` once (toast only), then again (modal opens); close modal and confirm textarea is highlighted/focused.
- Result: PASS
- Notes: —

## 2026-02-13 18:24:11 PST

- Date: 2026-02-13 18:24:11 PST
- Change summary: Show a global build/version badge in the top-right whenever Researcher Mode is on (including participant flow), align displayed version to `Current Working Version` in verification-log (v1.1.9), and use an `-uncommittedN` counter instead of SHAs.
- Key files: `src/components/BuildVersionBadge.tsx`, `src/lib/build-info.ts`, `vite.config.ts`, `src/App.tsx`, `src/pages/ResearcherDashboard.tsx`, `docs/verification-log.md`, `AGENTS.md`
- Related changelog:
  - Version: v1.1.9
  - Import JSON: —
  - Commit(s): (uncommitted)
- Test on your end:
  - Refresh any page with Researcher Mode enabled and confirm the top-right badge shows `v1.1.9` (or `v1.1.9-uncommittedN`).
  - Navigate between participant flow and researcher dashboard and confirm the badge stays visible and consistent.
- Result: PASS
- Notes: `uncommittedN` increments on dev HMR updates and persists across refreshes (keyed by git SHA).

## 2026-02-13 17:45:02 PST

- Date: 2026-02-13 17:45:02 PST
- Change summary: Improve dictation mic-issue UX (single-button modal, non-redundant copy) and strongly highlight the relevant text box after closing; show per-field fallback hint text only after an audio error is detected.
- Key files: `src/pages/FeedbackQuestionnaire.tsx`
- Related changelog:
  - Version: —
  - Import JSON: —
  - Commit(s): (uncommitted)
- Test on your end:
  - In participant mode, click Record for any feedback question and stop after ~1–2 seconds.
  - Confirm the “Trouble recording audio?” modal appears with one `Continue` button and optional issue report inputs.
  - Click `Continue` and confirm the relevant textarea is clearly highlighted/focused and the helper hint above it changes to the fallback message.
- Result: PASS
- Notes: —

## 2026-02-13 17:16:09 PST

- Date: 2026-02-13 17:16:09 PST
- Change summary: Show a "Tested" badge on each changelog change (PASS/FAIL/Not tested) and display verification details in the expanded change panel.
- Key files: `src/pages/ResearcherChangelog.tsx`
- Related changelog:
  - Version: 1.1.9
  - Import JSON: `docs/changelog-import-2026-02-13-1.1.9-4.json`
  - Commit(s): `fbd7c95`
- Test on your end:
  - Open Researcher Dashboard -> Changelog.
  - Confirm each change shows `Tested: PASS` / `Tested: FAIL` / `Not tested` as expected.
  - Expand a change and confirm the "Verification" section shows result + steps.
- Result: PASS
- Notes: —

## 2026-02-13 17:10:09 PST

- Date: 2026-02-13 17:10:09 PST
- Change summary: Add MP3 (ffmpeg.wasm) + WAV download options for feedback dictation audio clips and merged audio in Response Details.
- Key files: `src/pages/ResponseDetails.tsx`, `package.json`, `package-lock.json`
- Test on your end:
  - Opened a Response Details page with dictation audio.
  - Downloaded MP3 and confirmed it plays.
  - Downloaded WAV and confirmed it plays.
- Result: PASS
- Notes: MP3 encoding pulls in `@ffmpeg/core` (~32 MB WASM) on first use.

## 2026-02-13 16:50:00 PST

- Date: 2026-02-13 16:50:00 PST
- Change summary: Allow editing changelog release status (Committed/Pushed/Deployed) and fix `experiment_settings` upsert RLS for the “Auto mark release on push” toggle.
- Key files: `src/pages/ResearcherChangelog.tsx`, `supabase/migrations/20260214102000_experiment_settings_super_admin_insert_policy.sql`, `supabase/migrations/20260214100000_changelog_entries_release_status.sql`
- Test on your end:
  - Applied `20260214100000_changelog_entries_release_status.sql`, refreshed Changelog page, and used the new dropdown to set v1.1.9 to `Committed`.
  - Applied `20260214102000_experiment_settings_super_admin_insert_policy.sql`, toggled “Auto mark release on push”, and confirmed no RLS error.
- Result: PASS
- Notes: —

## 2026-02-13 17:04:28 PST

- Date: 2026-02-13 17:04:28 PST
- Change summary: Allow downloading feedback dictation audio clips and merged audio from Response Details.
- Key files: `src/pages/ResponseDetails.tsx`
- Test on your end:
  - Opened a Response Details page with dictation audio.
  - Clicked `Download clip` and confirmed the file downloaded and played locally.
- Result: PASS
- Notes: —

## 2026-02-13 15:22:27 PST

- Date: 2026-02-13 15:22:27 PST
- Change summary: Add repo-local confirmation gate + persistent verification log + future-features log entry for Statistical Analysis batch filtering.
- Key files: `AGENTS.md`, `docs/verification-log.md`, `docs/future-features.md`
- Test on your end:
  - Verified `main_2` and newly created `main_3` appear in Summary/Responses/Batch Scope selectors.
  - Ran `node scripts/participant-flow-smoke-test.mjs` and confirmed it prints `DONE: ... passed`.
- Result: PASS
- Notes: The smoke test currently doesn't assert `experiment_responses.submission_status`; you observed at least one completed-looking row with `submission_status='pending'`, which is likely the root of the `main_2` status/count mismatch when using `submission_status='submitted'` as the definition of completion.
