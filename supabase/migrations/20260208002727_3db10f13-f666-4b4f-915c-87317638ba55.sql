-- 1. Create the dictation_recordings table with tightened schema
CREATE TABLE public.dictation_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  prolific_id text NOT NULL,
  call_id text NULL,
  page_name text NOT NULL DEFAULT 'feedback',
  field text NOT NULL CHECK (field IN ('voice_assistant_feedback', 'experiment_feedback', 'communication_style_feedback')),
  mime_type text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'dictation-audio',
  storage_path text NOT NULL,
  file_size_bytes integer NOT NULL DEFAULT 0,
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

-- 4. RLS policies - anon can insert and select (needed for upload + signed URL playback)
CREATE POLICY "Anyone can insert dictation recordings"
  ON public.dictation_recordings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view dictation recordings"
  ON public.dictation_recordings FOR SELECT
  USING (true);

CREATE POLICY "No deletes allowed on dictation recordings"
  ON public.dictation_recordings FOR DELETE
  USING (false);

CREATE POLICY "No updates allowed on dictation recordings"
  ON public.dictation_recordings FOR UPDATE
  USING (false);

-- 5. Create storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('dictation-audio', 'dictation-audio', false)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage policies for dictation-audio bucket (anon accessible for upload + signed URL)
CREATE POLICY "Anyone can upload dictation audio"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'dictation-audio');

CREATE POLICY "Anyone can read dictation audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'dictation-audio');