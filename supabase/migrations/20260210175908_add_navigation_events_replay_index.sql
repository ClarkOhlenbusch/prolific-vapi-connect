-- Optimize session replay queries on the navigation_events table.
-- Without these indexes, queries filtering by prolific_id + event_type (especially
-- for 'session_replay_chunk' rows with large metadata payloads) can exceed the
-- Supabase statement timeout for participants with many events.

-- Used by the primary call-scoped replay query (filters on all four columns).
create index concurrently if not exists navigation_events_replay_idx
  on navigation_events (prolific_id, event_type, call_id, created_at);

-- Used by the prolific-only fallback replay query and count queries
-- (no call_id filter). Without this, the previous index can't efficiently
-- satisfy ORDER BY created_at when call_id is not in the WHERE clause.
create index concurrently if not exists navigation_events_replay_no_call_idx
  on navigation_events (prolific_id, event_type, created_at);
