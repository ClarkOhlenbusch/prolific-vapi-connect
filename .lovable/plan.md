
# Plan: Dictation Audio Storage & Build Error Fixes

## Summary
This plan addresses two interconnected issues:
1. **Build errors** caused by TypeScript type mismatches with the `Json` type
2. **New database infrastructure** for storing dictation audio recordings

The build errors exist because the code already references a `dictation_recordings` table and `dictation-audio` storage bucket that don't exist yet in the database, and there are TypeScript type casting issues with the `metadata` field.

---

## Technical Details

### Part 1: Database Migration

Create the `dictation_recordings` table and `dictation-audio` storage bucket with appropriate RLS policies.

**SQL Migration:**

```sql
-- 1. Create the dictation_recordings table
CREATE TABLE public.dictation_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  prolific_id text NOT NULL,
  call_id text NULL,
  page_name text NOT NULL,
  field text NOT NULL,
  mime_type text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'dictation-audio',
  storage_path text NOT NULL,
  file_size_bytes integer NULL,
  duration_ms integer NULL,
  attempt_count integer NOT NULL DEFAULT 1
);

-- 2. Create indexes for efficient querying
CREATE INDEX idx_dictation_recordings_prolific_created 
  ON public.dictation_recordings (prolific_id, created_at DESC);
CREATE INDEX idx_dictation_recordings_call_id 
  ON public.dictation_recordings (call_id);

-- 3. Enable Row Level Security
ALTER TABLE public.dictation_recordings ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies (same pattern as navigation_events)
CREATE POLICY "Anyone can insert dictation recordings"
  ON public.dictation_recordings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Researchers can view dictation recordings"
  ON public.dictation_recordings FOR SELECT
  USING (is_researcher(auth.uid()));

CREATE POLICY "No deletes allowed on dictation recordings"
  ON public.dictation_recordings FOR DELETE
  USING (false);

CREATE POLICY "No updates allowed on dictation recordings"
  ON public.dictation_recordings FOR UPDATE
  USING (false);

-- 5. Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('dictation-audio', 'dictation-audio', false);

-- 6. Storage policies for dictation-audio bucket
CREATE POLICY "Anyone can upload dictation audio"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'dictation-audio');

CREATE POLICY "Anyone can read dictation audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'dictation-audio');
```

### Part 2: TypeScript Fixes

Fix the type casting issues in four files where `Record<string, unknown>` or complex types are passed where `Json` is expected.

**File 1: `src/hooks/useSessionReplayTracking.ts` (line 209)**
- Issue: `rrwebEvents: chunk` is `eventWithTime[]` which isn't assignable to `Json`
- Fix: Cast `chunk` as `unknown as Json[]` to satisfy the type checker

**File 2: `src/pages/FeedbackQuestionnaire.tsx` (line 129)**
- Issue: `metadata: Record<string, unknown>` isn't directly assignable to `Json`
- Fix: Cast `metadata as Json` in the function call

**File 3: `src/pages/FeedbackQuestionnaire.tsx` (line 317)**
- Issue: Inserting into `dictation_recordings` which doesn't exist in types yet
- Fix: The table will exist after migration; keep the `as never` cast until types regenerate

**File 4: `src/pages/PracticeConversation.tsx` (line 65)**
- Issue: `metadata: Record<string, unknown>` passed to `logNavigationEvent`
- Fix: Cast `metadata as Json`

**File 5: `src/pages/VoiceConversation.tsx` (line 80)**
- Issue: Same `Record<string, unknown>` to `Json` mismatch
- Fix: Cast `metadata as Json`

---

## Implementation Steps

1. **Run the database migration** to create:
   - `dictation_recordings` table with indexes
   - RLS policies matching `navigation_events` pattern
   - `dictation-audio` storage bucket
   - Storage object policies for upload and read

2. **Fix TypeScript errors** in the four affected files by adding explicit type casts

3. **Verify the build** compiles without errors

4. **Test the dictation flow** in FeedbackQuestionnaire to confirm audio uploads work

---

## Files to Modify

| File | Change |
|------|--------|
| Database | New table, indexes, RLS, bucket, storage policies |
| `src/hooks/useSessionReplayTracking.ts` | Cast `rrwebEvents` to `unknown as Json[]` |
| `src/pages/FeedbackQuestionnaire.tsx` | Cast metadata objects to `Json` |
| `src/pages/PracticeConversation.tsx` | Cast metadata to `Json` |
| `src/pages/VoiceConversation.tsx` | Cast metadata to `Json` |
