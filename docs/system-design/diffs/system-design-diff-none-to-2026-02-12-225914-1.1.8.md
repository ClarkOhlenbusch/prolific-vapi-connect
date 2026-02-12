# System Design Diff

- From: none
- To: 2026-02-12-225914-1.1.8
- Version: 1.1.8
- Generated at: 2026-02-12T22:59:14.194Z
- Release status: local_only

## Summary

- Added files: 21
- Removed files: 0
- Changed files: 0

## Changed Files

- None

## Added Files

- `src/App.tsx`
- `src/components/researcher/StudyMap.tsx`
- `src/hooks/usePageTracking.ts`
- `src/lib/study-map/masterDiagram.ts`
- `src/pages/Complete.tsx`
- `src/pages/Consent.tsx`
- `src/pages/Debriefing.tsx`
- `src/pages/EarlyAccessSignup.tsx`
- `src/pages/FeedbackQuestionnaire.tsx`
- `src/pages/GodspeedQuestionnaire.tsx`
- `src/pages/NoConsent.tsx`
- `src/pages/ProlificId.tsx`
- `src/pages/Questionnaire.tsx`
- `src/pages/ResearcherChangelog.tsx`
- `src/pages/ResearcherDashboard.tsx`
- `src/pages/TiasQuestionnaire.tsx`
- `src/pages/TipiQuestionnaire.tsx`
- `supabase/functions/create-researcher-session/index.ts`
- `supabase/functions/submit-early-access/index.ts`
- `supabase/functions/submit-questionnaire/index.ts`
- `supabase/functions/upsert-experiment-draft/index.ts`

## Removed Files

- None

## Review Checklist

- Validate participant and researcher flow impacts in changelog details.
- Confirm high-risk changes include rollback notes.
- Confirm push approval before final commit/push.

