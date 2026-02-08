DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'participant_calls'
      AND column_name = 'token_used'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'participant_calls'
      AND column_name = 'is_completed'
  ) THEN
    ALTER TABLE public.participant_calls RENAME COLUMN token_used TO is_completed;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname = 'idx_participant_calls_token_used'
  ) THEN
    ALTER INDEX public.idx_participant_calls_token_used RENAME TO idx_participant_calls_is_completed;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'participant_calls'
      AND policyname = 'Allow updating token_used via session_token'
  ) THEN
    ALTER POLICY "Allow updating token_used via session_token"
      ON public.participant_calls
      RENAME TO "Allow updating is_completed via session_token";
  END IF;
END $$;
